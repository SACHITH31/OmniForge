import { requireOptionalNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import type { StoredFile } from './types';

export type PdfPage = { uri: string; width: number; height: number; pageCount: number };

type OutputModule = {
  renderPdfPage(source: string, index: number, maxSide: number): Promise<PdfPage>;
  open(uri: string, mimeType: string): Promise<void>;
  copyToDocument(source: string, destination: string): Promise<void>;
};

function androidOutput(): OutputModule {
  const module = requireOptionalNativeModule<OutputModule>('OmniOutput');
  if (!module) throw new Error('This action requires the OmniForge Android build.');
  return module;
}

async function checkFile(file: StoredFile) {
  const info = await FileSystem.getInfoAsync(file.uri);
  if (!info.exists || info.isDirectory) throw new Error('The saved file is no longer available.');
}

export async function openOutput(file: StoredFile): Promise<void> {
  const module = androidOutput();
  await checkFile(file);
  await module.open(await FileSystem.getContentUriAsync(file.uri), file.mimeType);
}

export async function exportOutput(file: StoredFile): Promise<boolean> {
  const module = androidOutput();
  await checkFile(file);
  const saf = FileSystem.StorageAccessFramework;
  const folder = await saf.requestDirectoryPermissionsAsync();
  if (!folder.granted) return false;

  const destination = await saf.createFileAsync(folder.directoryUri, file.name, file.mimeType);
  try {
    await module.copyToDocument(file.uri, destination);
  } catch (error) {
    await saf.deleteAsync(destination, { idempotent: true }).catch(() => {});
    throw error;
  }
  return true;
}

export function renderPdfPage(file: StoredFile, index: number, maxSide: number): Promise<PdfPage> {
  return androidOutput().renderPdfPage(file.uri, index, maxSide);
}
