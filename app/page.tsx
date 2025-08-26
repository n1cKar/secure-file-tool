import Link from "next/link";

export default function Home() {
  return (
    <div className="grid gap-8">
      {/* Hero Section */}
      <section className="card text-center">
        <h1 className="mb-2 text-3xl font-bold">🔐 Secure File Tool</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Encrypt and decrypt files entirely in your browser. <br />
          Uses AES-GCM encryption with PBKDF2 key derivation. Files never leave your device.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Link className="btn" href="/encrypt">📝 Encrypt a File</Link>
          <Link className="btn" href="/decrypt">🔑 Decrypt a File</Link>
        </div>
      </section>

      {/* How It Works */}
      <section className="card">
        <h2 className="mb-3 text-xl font-semibold">🛠 How It Works</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700 dark:text-gray-300">
          <li>Select a file and enter a passphrase.</li>
          <li>The passphrase is converted into a secure key using PBKDF2 (SHA-256) with a random salt and IV.</li>
          <li>The encrypted file includes a header, salt, IV, and original file details (name & type).</li>
          <li>To decrypt, upload the file and use the same passphrase. If correct, your original file is restored.</li>
        </ol>
      </section>


      {/* Security Tips */}
      <section className="card">
        <h2 className="mb-3 text-xl font-semibold">💡 Tips & Security Notes</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700 dark:text-gray-300">
          <li>Use a strong, unique passphrase for each file.</li>
          <li>Keep a backup of your passphrase—without it, files cannot be decrypted.</li>
          <li>Encrypted files are safe to share, as decryption requires your passphrase.</li>
          <li>All processing happens on your device; no data is uploaded to any server.</li>
        </ul>
      </section>
    </div>
  );
}
