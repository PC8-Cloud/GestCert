import { supabase } from './supabase';

export function isDataUrl(value: string): boolean {
  return value.startsWith('data:');
}

export function looksLikeBase64(value: string): boolean {
  return /^[A-Za-z0-9+/=\s]+$/.test(value);
}

export function dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string } | null {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return null;
  const mimeType = matches[1];
  const base64Data = matches[2];
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return { blob: new Blob([byteArray], { type: mimeType }), mimeType };
}

export function base64ToDataUrl(base64: string): string | null {
  const cleaned = base64.replace(/\s+/g, '');
  if (cleaned.startsWith('JVBER')) return `data:application/pdf;base64,${cleaned}`;
  if (cleaned.startsWith('/9j/')) return `data:image/jpeg;base64,${cleaned}`;
  if (cleaned.startsWith('iVBOR')) return `data:image/png;base64,${cleaned}`;
  return null;
}

export function storageUrlFor(bucket: string, path: string): string {
  return `storage://${bucket}/${path}`;
}

export function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url.startsWith('storage://')) return null;
  const withoutScheme = url.replace('storage://', '');
  const firstSlash = withoutScheme.indexOf('/');
  if (firstSlash === -1) return null;
  const bucket = withoutScheme.slice(0, firstSlash);
  const path = withoutScheme.slice(firstSlash + 1);
  if (!bucket || !path) return null;
  return { bucket, path };
}

export async function uploadDataUrlToStorage(
  bucket: string,
  path: string,
  dataUrl: string
): Promise<void> {
  const parsed = dataUrlToBlob(dataUrl);
  if (!parsed) throw new Error('Formato file non valido');
  const { blob, mimeType } = parsed;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    upsert: true,
    contentType: mimeType
  });
  if (error) throw error;
}

export async function createSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds: number = 60 * 10
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
