"use client";

import { useState } from "react";
import FileDrop from "@/components/FileDrop";
import PasswordStrength from "@/components/PasswordStrength";
import { decryptFile } from "@/lib/crypto";
import { downloadBlob } from "@/utils/file";
import Link from "next/link";

export default function DecryptPage() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDecrypt() {
    if (!file || !password) return;
    setBusy(true);
    setError(null);
    try {
      const { blob, suggestedName } = await decryptFile(file, password);
      downloadBlob(blob, suggestedName);
    } catch (error: unknown) {
      let msg = "Decryption failed";
      if (error instanceof Error) msg = error.message;

      // Friendly error message for common cases
      const friendly = /operation failed|decrypt/i.test(msg)
        ? "Wrong password or file is corrupted."
        : msg;

      setError(friendly);
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
          Use this page to securely decrypt files that were previously encrypted with Secure File Tool.
          Simply upload your encrypted <code>.enc</code> file, enter the same passphrase used during encryption,
          and download the original file. All processing happens in your browser, and no file data is sent to a server.
        </p>
      </div>

      <h2 className="text-2xl font-bold">Decrypt a File</h2>
      <FileDrop onFile={setFile} accept=".enc" />
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
          placeholder="Enter the same passphrase used to encrypt"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordStrength password={password} />
      </div>

      <button className="btn w-fit" disabled={!file || !password || busy} onClick={handleDecrypt}>
        {busy ? "Decrypting..." : "Decrypt & Download"}
      </button>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950">
          {error}
        </div>
      )}

      <p className="text-xs text-gray-500">
        If the password or file header is incorrect, decryption will fail for safety.
      </p>
    </div>
  );
}
