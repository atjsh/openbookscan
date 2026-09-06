export function epubFilename(filename: string): string {
  return filename.replace(/\.pdf$/i, '') + '.epub';
}

export function createDownload(bytes: Uint8Array, filename: string) {
  const blob = new Blob([new Uint8Array(bytes)], {
    type: 'application/epub+zip',
  });
  const url = URL.createObjectURL(blob);
  return {
    url,
    filename: epubFilename(filename),
    size: blob.size,
    dispose: () => URL.revokeObjectURL(url),
  };
}
