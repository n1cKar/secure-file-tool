// ===== Header formats =====
// SFE1 (legacy): [MAGIC(4)="SFE1"][SALT(16)][IV(12)][nameLen(2)][name][mimeLen(2)][mime][ciphertext]
// SFE2 (new)   : [MAGIC(4)="SFE2"][ALG(1)][SALT(16)][IV(var)][nameLen(2)][name][mimeLen(2)][mime][ciphertext]
// ALG: 0x01=AES-GCM, 0x02=AES-CBC

const MAGIC_V1 = new TextEncoder().encode("SFE1");
const MAGIC_V2 = new TextEncoder().encode("SFE2");

export type Algorithm = "AES-GCM" | "AES-CBC";

const ALG_BYTE = {
  "AES-GCM": 0x01,
  "AES-CBC": 0x02,
} as const;

const SALT_BYTES = 16;
const GCM_IV_BYTES = 12; // 96-bit
const CBC_IV_BYTES = 16; // 128-bit
const ITERATIONS = 200_000;
const KEY_LENGTH = 256; // bits

function utf8Encode(s: string) {
  return new TextEncoder().encode(s);
}
function utf8Decode(b: ArrayBuffer | Uint8Array) {
  return new TextDecoder().decode(b instanceof Uint8Array ? b : new Uint8Array(b));
}
function concatBytes(chunks: Uint8Array[]) {
  const total = chunks.reduce((a, c) => a + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}
function u16(n: number) {
  const dv = new DataView(new ArrayBuffer(2));
  dv.setUint16(0, n, false);
  return new Uint8Array(dv.buffer);
}
function readU16(view: DataView, offset: number) {
  return view.getUint16(offset, false);
}

async function deriveKeyForAlgo(password: string, salt: Uint8Array, algorithm: Algorithm) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    utf8Encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  // IMPORTANT: derive a key whose algorithm matches the operation
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new Uint8Array(salt),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: algorithm, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

function getSuggestedEncName(origName: string) {
  return `${origName}.enc`;
}

// ========== ENCRYPT ==========
export async function encryptFile(
  file: File,
  password: string,
  algorithm: Algorithm = "AES-GCM"
): Promise<{ blob: Blob; suggestedName: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv =
    algorithm === "AES-GCM"
      ? crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES))
      : crypto.getRandomValues(new Uint8Array(CBC_IV_BYTES));

  const key = await deriveKeyForAlgo(password, salt, algorithm);

  const plain = new Uint8Array(await file.arrayBuffer());
  const cipherBuf = await crypto.subtle.encrypt({ name: algorithm, iv }, key, plain);

  // best-effort zero
  plain.fill(0);

  const nameBytes = utf8Encode(file.name);
  const mimeBytes = utf8Encode(file.type || "application/octet-stream");

  // New SFE2 header (includes algorithm byte)
  const header = concatBytes([
    MAGIC_V2,
    new Uint8Array([ALG_BYTE[algorithm]]),
    salt,
    iv,
    u16(nameBytes.byteLength),
    nameBytes,
    u16(mimeBytes.byteLength),
    mimeBytes,
  ]);

  const out = concatBytes([header, new Uint8Array(cipherBuf)]);
  const blob = new Blob([out], { type: "application/octet-stream" });
  return { blob, suggestedName: getSuggestedEncName(file.name) };
}

// ========== DECRYPT ==========
export async function decryptFile(
  file: File,
  password: string
): Promise<{ blob: Blob; suggestedName: string }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.byteLength < 4) throw new Error("Invalid or too-small file.");

  const magic = buf.slice(0, 4);
  const isV2 = magic.every((b, i) => b === MAGIC_V2[i]);
  const isV1 = magic.every((b, i) => b === MAGIC_V1[i]);
  if (!isV1 && !isV2) throw new Error("Invalid file header.");

  let off = 4;
  let algorithm: Algorithm = "AES-GCM";
  let ivLen = GCM_IV_BYTES;

  if (isV2) {
    if (buf.byteLength < off + 1 + SALT_BYTES) throw new Error("Invalid header.");
    const algByte = buf[off++];
    if (algByte === ALG_BYTE["AES-GCM"]) {
      algorithm = "AES-GCM";
      ivLen = GCM_IV_BYTES;
    } else if (algByte === ALG_BYTE["AES-CBC"]) {
      algorithm = "AES-CBC";
      ivLen = CBC_IV_BYTES;
    } else {
      throw new Error("Unsupported algorithm.");
    }
  } else {
    // SFE1 legacy (no algorithm byte). It was AES-GCM with 12-byte IV.
    algorithm = "AES-GCM";
    ivLen = GCM_IV_BYTES;
  }

  if (buf.byteLength < off + SALT_BYTES + ivLen + 2 + 2)
    throw new Error("Invalid or too-small file.");

  const salt = buf.slice(off, off + SALT_BYTES); off += SALT_BYTES;
  const iv = buf.slice(off, off + ivLen); off += ivLen;

  const dv1 = new DataView(buf.buffer, buf.byteOffset + off);
  const nameLen = readU16(dv1, 0); off += 2;
  if (off + nameLen > buf.byteLength) throw new Error("Corrupted name field.");
  const nameBytes = buf.slice(off, off + nameLen); off += nameLen;

  const dv2 = new DataView(buf.buffer, buf.byteOffset + off);
  const mimeLen = readU16(dv2, 0); off += 2;
  if (off + mimeLen > buf.byteLength) throw new Error("Corrupted MIME field.");
  const mimeBytes = buf.slice(off, off + mimeLen); off += mimeLen;

  const ciphertext = buf.slice(off);
  if (ciphertext.byteLength < 16) throw new Error("Ciphertext too small.");

  const key = await deriveKeyForAlgo(password, new Uint8Array(salt), algorithm);

  let plainBuf: ArrayBuffer;
  try {
    plainBuf = await crypto.subtle.decrypt({ name: algorithm, iv }, key, ciphertext);
  } catch {
    // AES-GCM will throw on auth fail; AES-CBC will typically throw on bad padding
    throw new Error("Wrong password or file is corrupted.");
  }

  const name = utf8Decode(nameBytes);
  const mime = utf8Decode(mimeBytes) || "application/octet-stream";
  const blob = new Blob([plainBuf], { type: mime });

  // best-effort zero
  new Uint8Array(plainBuf).fill(0);

  return { blob, suggestedName: name };
}
