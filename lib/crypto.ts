// ===== Header formats =====
//
// Legacy (SFE1):
//   [MAGIC(4)="SFE1"][SALT(16)][IV(12)][nameLen(2)][name][mimeLen(2)][mime][ciphertext]
//   - Supports only AES-GCM with fixed 12-byte IV
//
// New (SFE2):
//   [MAGIC(4)="SFE2"][ALG(1)][SALT(16)][IV(var)][nameLen(2)][name][mimeLen(2)][mime][ciphertext]
//   - Adds an algorithm byte so we can choose between AES-GCM and AES-CBC
//   - IV size depends on algorithm (12 bytes for GCM, 16 bytes for CBC)
//
// ALG codes:
//   0x01 = AES-GCM
//   0x02 = AES-CBC

const MAGIC_V1 = new TextEncoder().encode("SFE1");
const MAGIC_V2 = new TextEncoder().encode("SFE2");

export type Algorithm = "AES-GCM" | "AES-CBC";

const ALG_BYTE = {
  "AES-GCM": 0x01,
  "AES-CBC": 0x02,
} as const;

// === Parameters ===
const SALT_BYTES = 16;       // Salt length for PBKDF2
const GCM_IV_BYTES = 12;     // Standard 96-bit IV for AES-GCM
const CBC_IV_BYTES = 16;     // 128-bit IV for AES-CBC
const ITERATIONS = 200_000;  // PBKDF2 iterations (slow for brute force)
const KEY_LENGTH = 256;      // AES key size in bits (256-bit)

// === Small helpers ===
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
// Write a 16-bit integer (big-endian)
function u16(n: number) {
  const dv = new DataView(new ArrayBuffer(2));
  dv.setUint16(0, n, false);
  return new Uint8Array(dv.buffer);
}
// Read a 16-bit integer (big-endian)
function readU16(view: DataView, offset: number) {
  return view.getUint16(offset, false);
}

// === Key Derivation ===
//
// Derives a key using PBKDF2-SHA256 with the given salt
// Output key is bound to the chosen algorithm (AES-GCM or AES-CBC)
async function deriveKeyForAlgo(password: string, salt: Uint8Array, algorithm: Algorithm) {
  // Import password as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    utf8Encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  // Derive algorithm-specific AES key
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

// Suggests a ".enc" filename for encrypted output
function getSuggestedEncName(origName: string) {
  return `${origName}.enc`;
}

// ========== ENCRYPT ==========
export async function encryptFile(
  file: File,
  password: string,
  algorithm: Algorithm = "AES-GCM" // Default is AES-GCM
): Promise<{ blob: Blob; suggestedName: string }> {
  // Generate random salt & IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv =
    algorithm === "AES-GCM"
      ? crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES))
      : crypto.getRandomValues(new Uint8Array(CBC_IV_BYTES));

  // Derive key bound to chosen algorithm
  const key = await deriveKeyForAlgo(password, salt, algorithm);

  // Read file into memory
  const plain = new Uint8Array(await file.arrayBuffer());

  // Encrypt with WebCrypto
  const cipherBuf = await crypto.subtle.encrypt({ name: algorithm, iv }, key, plain);

  // Wipe plaintext from memory (best-effort)
  plain.fill(0);

  // Encode filename & MIME type
  const nameBytes = utf8Encode(file.name);
  const mimeBytes = utf8Encode(file.type || "application/octet-stream");

  // Build SFE2 header
  const header = concatBytes([
    MAGIC_V2,
    new Uint8Array([ALG_BYTE[algorithm]]), // algorithm marker
    salt,
    iv,
    u16(nameBytes.byteLength),
    nameBytes,
    u16(mimeBytes.byteLength),
    mimeBytes,
  ]);

  // Final output = header + ciphertext
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

  // Check magic
  const magic = buf.slice(0, 4);
  const isV2 = magic.every((b, i) => b === MAGIC_V2[i]);
  const isV1 = magic.every((b, i) => b === MAGIC_V1[i]);
  if (!isV1 && !isV2) throw new Error("Invalid file header.");

  let off = 4;
  let algorithm: Algorithm = "AES-GCM"; // default
  let ivLen = GCM_IV_BYTES;

  if (isV2) {
    // Read algorithm byte
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
    // Legacy SFE1 files were AES-GCM with fixed 12-byte IV
    algorithm = "AES-GCM";
    ivLen = GCM_IV_BYTES;
  }

  // Sanity check length
  if (buf.byteLength < off + SALT_BYTES + ivLen + 2 + 2)
    throw new Error("Invalid or too-small file.");

  // Parse salt + IV
  const salt = buf.slice(off, off + SALT_BYTES); off += SALT_BYTES;
  const iv = buf.slice(off, off + ivLen); off += ivLen;

  // Parse filename
  const dv1 = new DataView(buf.buffer, buf.byteOffset + off);
  const nameLen = readU16(dv1, 0); off += 2;
  if (off + nameLen > buf.byteLength) throw new Error("Corrupted name field.");
  const nameBytes = buf.slice(off, off + nameLen); off += nameLen;

  // Parse MIME type
  const dv2 = new DataView(buf.buffer, buf.byteOffset + off);
  const mimeLen = readU16(dv2, 0); off += 2;
  if (off + mimeLen > buf.byteLength) throw new Error("Corrupted MIME field.");
  const mimeBytes = buf.slice(off, off + mimeLen); off += mimeLen;

  // Remaining bytes = ciphertext
  const ciphertext = buf.slice(off);
  if (ciphertext.byteLength < 16) throw new Error("Ciphertext too small.");

  // Re-derive same key
  const key = await deriveKeyForAlgo(password, new Uint8Array(salt), algorithm);

  let plainBuf: ArrayBuffer;
  try {
    // Attempt decrypt
    plainBuf = await crypto.subtle.decrypt({ name: algorithm, iv }, key, ciphertext);
  } catch {
    // AES-GCM: throws on auth failure
    // AES-CBC: throws on padding mismatch
    throw new Error("Wrong password or file is corrupted.");
  }

  // Decode metadata
  const name = utf8Decode(nameBytes);
  const mime = utf8Decode(mimeBytes) || "application/octet-stream";
  const blob = new Blob([plainBuf], { type: mime });

  // Wipe decrypted memory
  new Uint8Array(plainBuf).fill(0);

  return { blob, suggestedName: name };
}
