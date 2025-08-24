"use client";

import { useCallback, useRef, useState } from "react";

export default function FileDrop({
  onFile,
  accept,
}: {
  onFile: (f: File | null) => void;
  accept?: string;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return onFile(null);
      const f = files[0];
      if (accept && accept !== "*/*") {
        const acceptExts = accept.split(",").map((s) => s.trim());
        const ok = acceptExts.some((ext) => f.name.endsWith(ext));
        if (!ok) return onFile(null);
      }
      onFile(f);
    },
    [accept, onFile]
  );

  return (
    <div
      className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition
      ${dragOver ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20" : "border-gray-300 dark:border-gray-700"}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      aria-label="Upload file"
      tabIndex={0}
    >
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Drag & drop a file here, or click to browse
      </p>
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept={accept}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
