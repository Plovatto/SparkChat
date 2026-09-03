export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array<number>(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i += 1) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }

  return new Uint8Array(byteNumbers);
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export function downloadBytes(bytes: Uint8Array<ArrayBuffer>, filename: string, mimeType = 'application/octet-stream'): void {
  triggerBlobDownload(new Blob([bytes], { type: mimeType }), filename);
}

export async function downloadFromUrl(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Não foi possível baixar o arquivo.');
  }

  triggerBlobDownload(await response.blob(), filename);
}
