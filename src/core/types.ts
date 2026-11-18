export type ToolKind = 'convert' | 'compress' | 'pdf' | 'import';
export type OutputFormat = 'jpeg' | 'png';

export interface StoredFile {
  id: string;
  name: string;
  uri: string;
  mimeType: string;
  bytes: number;
  createdAt: string;
  favorite?: boolean;
  kind: ToolKind;
}

export interface AppSettings {
  jpegQuality: number;
}

export const DEFAULT_SETTINGS: AppSettings = { jpegQuality: 0.72 };

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function safeFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'file';
}

export function supportedImage(mimeType: string | undefined, name: string): boolean {
  const lower = name.toLowerCase();
  return mimeType === 'image/jpeg' || mimeType === 'image/png' || /\.(jpe?g|png)$/.test(lower);
}
