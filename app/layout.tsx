import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Secure File Tool",
  description: "Encrypt/Decrypt files in your browser (AES-GCM)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 text-gray-900`}
      >
        <header className="w-full border-b border-gray-200 bg-amber-950 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-3">
            <h1 className="text-xl font-semibold">🔐 Secure File Tool</h1>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
  
        <footer className="w-full border-t border-gray-200 bg-amber-950 text-center py-4 text-sm text-gray-500">
          © {new Date().getFullYear()} Secure File Tool. Made by Nimash Mendis.
        </footer>
      </body>
    </html>
  );
}
