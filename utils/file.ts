export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function getNameAndExt(name: string) {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return { base: name, ext: "" };
  return { base: name.slice(0, idx), ext: name.slice(idx) };
}
