// lib/crypto.ts
const MAGIC = new TextEncoder().encode("SFE1"); // 4 bytes
const SALT_BYTES = 16;
const IV_BYTES = 12;
const ITERATIONS = 200_000; // PBKDF2 iterations (balance security & UX)
const KEY_LENGTH = 256;

function utf8Encode(s: string) {
  return new TextEncoder().encode(s);
}
function utf8Decode(b: ArrayBuffer | Uint8Array) {
  return new TextDecoder().decode(b instanceof Uint8Array ? b : new Uint8Array(b));
}

async function deriveKey(password: string, salt: Uint8Array) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    utf8Encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new Uint8Array(salt), // ✅ Uint8Array is fine, but TS may complain
      // if so, replace with:
      // salt: salt.buffer,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
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
  dv.setUint16(0, n, false); // big-endian
  return new Uint8Array(dv.buffer);
}

function readU16(view: DataView, offset: number) {
  return view.getUint16(offset, false);
}

function getSuggestedEncName(origName: string) {
  return `${origName}.enc`;
}

export async function encryptFile(
  file: File,
  password: string
): Promise<{ blob: Blob; suggestedName: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt);

  const plain = new Uint8Array(await file.arrayBuffer());

  // Encrypt (GCM returns ciphertext||tag)
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plain
  );
  // "Secure delete": overwrite plain buffer
  plain.fill(0);

  const nameBytes = utf8Encode(file.name);
  const mimeBytes = utf8Encode(file.type || "application/octet-stream");

  const header = concatBytes([
    MAGIC,
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

export async function decryptFile(
  file: File,
  password: string
): Promise<{ blob: Blob; suggestedName: string }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  // Parse header
  if (buf.byteLength < MAGIC.byteLength + SALT_BYTES + IV_BYTES + 2 + 2) {
    throw new Error("Invalid or too-small file.");
  }
  // Magic
  const magic = buf.slice(0, MAGIC.byteLength);
  if (!magic.every((b, i) => b === MAGIC[i])) throw new Error("Invalid file header.");

  let off = MAGIC.byteLength;

  const salt = buf.slice(off, off + SALT_BYTES); off += SALT_BYTES;
  const iv = buf.slice(off, off + IV_BYTES);     off += IV_BYTES;

  const dvView = new DataView(buf.buffer, buf.byteOffset + off);
  const nameLen = readU16(dvView, 0);
  off += 2;
  if (off + nameLen > buf.byteLength) throw new Error("Corrupted name field.");
  const nameBytes = buf.slice(off, off + nameLen);
  off += nameLen;

  const dvView2 = new DataView(buf.buffer, buf.byteOffset + off);
  const mimeLen = readU16(dvView2, 0);
  off += 2;
  if (off + mimeLen > buf.byteLength) throw new Error("Corrupted MIME field.");
  const mimeBytes = buf.slice(off, off + mimeLen);
  off += mimeLen;

  const ciphertext = buf.slice(off);
  if (ciphertext.byteLength < 16) throw new Error("Ciphertext too small.");

  const key = await deriveKey(password, salt);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
  } catch {
    throw new Error("Decryption failed (auth).");
  }

  const name = utf8Decode(nameBytes);
  const mime = utf8Decode(mimeBytes) || "application/octet-stream";

  const blob = new Blob([plain], { type: mime });
  // "Secure delete": try to zero plaintext
  new Uint8Array(plain).fill(0);

  return { blob, suggestedName: name };
}
