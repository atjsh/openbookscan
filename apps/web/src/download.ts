export function epubFilename(filename: string): string {
  return filename.replace(/\.pdf$/i, '') + '.epub';
}

export function createDownload(link: HTMLAnchorElement) {
  let url: string | undefined;
  const clear = () => {
    link.hidden = true;
    link.removeAttribute('href');
    if (url) URL.revokeObjectURL(url);
    url = undefined;
  };
  return {
    clear,
    show(bytes: Uint8Array, filename: string) {
      clear();
      const blob = new Blob([new Uint8Array(bytes)], {
        type: 'application/epub+zip',
      });
      url = URL.createObjectURL(blob);
      link.href = url;
      link.download = epubFilename(filename);
      link.hidden = false;
      return blob.size;
    },
  };
}
