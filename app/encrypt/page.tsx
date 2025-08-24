"use client";

import { useState } from "react";
import FileDrop from "@/components/FileDrop";
import PasswordStrength from "@/components/PasswordStrength";
import { encryptFile, Algorithm } from "@/lib/crypto";
import { downloadBlob } from "@/utils/file";
import Link from "next/link";

export default function EncryptPage() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [algorithm, setAlgorithm] = useState<Algorithm>("AES-GCM");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEncrypt() {
    if (!file || !password) return;
    setBusy(true);
    setError(null);
    try {
      const { blob, suggestedName } = await encryptFile(file, password, algorithm);
      downloadBlob(blob, suggestedName);
    } catch (e: unknown) {
      setError((e as Error)?.message || "Encryption failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="mt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-md text-sm font-medium transition"
        >
          🏠 Home
        </Link>
        <p className="mt-3 text-gray-600 dark:text-gray-400 text-sm max-w-xl">
          Upload a file, enter a passphrase, choose an encryption algorithm, and download the encrypted file. All encryption happens locally in your browser.
        </p>
      </div>

      <h2 className="text-2xl font-bold">Encrypt a File</h2>
      <FileDrop onFile={setFile} accept="*/*" />
      {file && (
        <div className="rounded-xl border border-gray-200 p-4 text-sm dark:border-gray-800">
          <p>
            <span className="font-medium">Selected:</span> {file.name} ({Math.ceil(file.size / 1024)} KB)
          </p>
        </div>
      )}

      <div className="grid gap-2">
        <label className="text-sm font-medium">Passphrase</label>
        <input
          className="input"
          type="password"
          placeholder="Enter a strong passphrase"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <PasswordStrength password={password} />
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium">Algorithm</label>
        <select
          className="input w-fit"
          value={algorithm}
          onChange={e => setAlgorithm(e.target.value as Algorithm)}
        >
          <option value="AES-GCM">AES-GCM (Recommended)</option>
          <option value="AES-CBC">AES-CBC</option>
        </select>
      </div>

      <button
        className="btn w-fit"
        disabled={!file || !password || busy}
        onClick={handleEncrypt}
      >
        {busy ? "Encrypting..." : "Encrypt & Download"}
      </button>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950">
          {error}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Tip: All encryption occurs locally in your browser. AES-GCM is recommended for most use cases.
      </p>
    </div>
  );
}
