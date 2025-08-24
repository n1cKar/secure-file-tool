const MAGIC = new TextEncoder().encode("SFE1"); // 4 bytes
const SALT_BYTES = 16;
const IV_BYTES = 16; // AES-CBC uses 128-bit IV
const GCM_IV_BYTES = 12; // AES-GCM still 12 bytes
const ITERATIONS = 200_000;
const KEY_LENGTH = 256;

export type Algorithm = "AES-GCM" | "AES-CBC";
const ALG_BYTE = {
  "AES-GCM": 0x01,
  "AES-CBC": 0x02,
} as const;

function utf8Encode(s: string) { return new TextEncoder().encode(s); }
function utf8Decode(b: ArrayBuffer | Uint8Array) { return new TextDecoder().decode(b instanceof Uint8Array ? b : new Uint8Array(b)); }
function concatBytes(chunks: Uint8Array[]) {
  const total = chunks.reduce((a, c) => a + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}
function u16(n: number) { const dv = new DataView(new ArrayBuffer(2)); dv.setUint16(0, n, false); return new Uint8Array(dv.buffer); }
function readU16(view: DataView, offset: number) { return view.getUint16(offset, false); }

async function deriveKey(password: string, salt: Uint8Array) {
  const keyMaterial = await crypto.subtle.importKey("raw", utf8Encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
  return crypto.subtle.deriveKey({
    name: "PBKDF2",
    salt: new Uint8Array(salt),
    iterations: ITERATIONS,
    hash: "SHA-256",
  }, keyMaterial, { name: "AES-CBC", length: KEY_LENGTH }, false, ["encrypt", "decrypt"]);
}

function getSuggestedEncName(origName: string) { return `${origName}.enc`; }

// ------------------- ENCRYPT -------------------
export async function encryptFile(file: File, password: string, algorithm: Algorithm = "AES-GCM"): Promise<{ blob: Blob; suggestedName: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(algorithm === "AES-GCM" ? GCM_IV_BYTES : IV_BYTES));
  const key = await deriveKey(password, salt);

  const plain = new Uint8Array(await file.arrayBuffer());
  let cipherBuf: ArrayBuffer;

  if (algorithm === "AES-GCM") {
    cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  } else {
    cipherBuf = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, plain);
  }
  plain.fill(0);

  const nameBytes = utf8Encode(file.name);
  const mimeBytes = utf8Encode(file.type || "application/octet-stream");

  const header = concatBytes([
    MAGIC,
    new Uint8Array([ALG_BYTE[algorithm]]),
    salt,
    iv,
    u16(nameBytes.byteLength),
    nameBytes,
    u16(mimeBytes.byteLength),
    mimeBytes,
  ]);

  const out = concatBytes([header, new Uint8Array(cipherBuf)]);
  return { blob: new Blob([out], { type: "application/octet-stream" }), suggestedName: getSuggestedEncName(file.name) };
}

// ------------------- DECRYPT -------------------
export async function decryptFile(file: File, password: string): Promise<{ blob: Blob; suggestedName: string }> {
  const buf = new Uint8Array(await file.arrayBuffer());

  if (buf.byteLength < MAGIC.byteLength + 1 + SALT_BYTES + IV_BYTES + 2 + 2) throw new Error("Invalid or too-small file.");
  const magic = buf.slice(0, MAGIC.byteLength);
  if (!magic.every((b, i) => b === MAGIC[i])) throw new Error("Invalid file header.");

  let off = MAGIC.byteLength;
  const algByte = buf[off++];
  let algorithm: Algorithm = "AES-GCM";
  if (algByte === ALG_BYTE["AES-GCM"]) algorithm = "AES-GCM";
  else if (algByte === ALG_BYTE["AES-CBC"]) algorithm = "AES-CBC";
  else throw new Error("Unsupported algorithm.");

  const salt = buf.slice(off, off + SALT_BYTES); off += SALT_BYTES;
  const iv = buf.slice(off, off + (algorithm === "AES-GCM" ? GCM_IV_BYTES : IV_BYTES)); off += (algorithm === "AES-GCM" ? GCM_IV_BYTES : IV_BYTES);

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

  const key = await deriveKey(password, salt);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: algorithm, iv }, key, ciphertext);
  } catch {
    throw new Error("Wrong password or file is corrupted.");
  }

  const name = utf8Decode(nameBytes);
  const mime = utf8Decode(mimeBytes) || "application/octet-stream";
  const blob = new Blob([plain], { type: mime });
  new Uint8Array(plain).fill(0);

  return { blob, suggestedName: name };
}
