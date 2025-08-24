"use client";

import { useState } from "react";
import FileDrop from "@/components/FileDrop";
import PasswordStrength from "@/components/PasswordStrength";
import { encryptFile } from "@/lib/crypto";
import { downloadBlob } from "@/utils/file";
import Link from "next/link";

export default function EncryptPage() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEncrypt() {
    if (!file || !password) return;
    setBusy(true);
    setError(null);
    try {
      const { blob, suggestedName } = await encryptFile(file, password);
      downloadBlob(blob, suggestedName);
    } catch (e: any) {
      setError(e?.message || "Encryption failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      {/* Home Button */}
      <div className="mt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-md text-sm font-medium transition"
        >
          🏠 Home
        </Link>

        {/* Page Description */}
        <p className="mt-3 text-gray-600 dark:text-gray-400 text-sm max-w-xl">
          Use this page to securely encrypt your files before sharing or storing them. 
          Upload any file type, enter a strong passphrase, and download the encrypted 
          <code>.enc</code> file. All encryption happens in your browser using AES-GCM 
          with PBKDF2 key derivation—your files never leave your device.
        </p>
      </div>

      <h2 className="text-2xl font-bold">Encrypt a File</h2>
      <FileDrop onFile={setFile} accept="*/*" />
      {file && (
        <div className="rounded-xl border border-gray-200 p-4 text-sm dark:border-gray-800">
          <p><span className="font-medium">Selected:</span> {file.name} ({Math.ceil(file.size / 1024)} KB)</p>
        </div>
      )}

      <div className="grid gap-2">
        <label className="text-sm font-medium">Passphrase</label>
        <input
          className="input"
          type="password"
          placeholder="Enter a strong passphrase"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordStrength password={password} />
      </div>

      <button className="btn w-fit" disabled={!file || !password || busy} onClick={handleEncrypt}>
        {busy ? "Encrypting..." : "Encrypt & Download"}
      </button>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950">
          {error}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Tip: We never upload your files. All encryption occurs locally in your browser using the Web Crypto API.
      </p>
    </div>
  );
}
