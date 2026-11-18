import { requireOptionalNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import type { StoredFile } from './types';

export type PdfPage = { uri: string; width: number; height: number; pageCount: number };

export type PdfTextBlock = {
  text: string;
  bounds: [left: number, top: number, right: number, bottom: number][];
};

export type PdfSearchHit = { pageIndex: number; count: number };

export type PdfThumbnail = Omit<PdfPage, 'pageCount'> & { pageIndex: number };

export type EditableRun = { id: number; text: string; family: string; size: number; bold: boolean; italic: boolean };
export type EditedPreview = Omit<PdfPage, 'pageCount'> & { documentUri: string };

type OutputModule = {
  supportsPdfTextEditing: boolean;
  inspectPdfRuns(source: string, index: number): Promise<EditableRun[]>;
  previewPdfEdit(source: string, index: number, id: number, original: string, replacement: string): Promise<EditedPreview>;
  savePdfPageImage(source: string, index: number, destination: string, format: 'jpeg' | 'png'): Promise<void>;
  renderPdfThumbnails(source: string, first: number, count: number): Promise<PdfThumbnail[]>;
  searchPdfPages(source: string, query: string, first: number, count: number): Promise<PdfSearchHit[]>;
  readPdfText(source: string, index: number): Promise<PdfTextBlock[]>;
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

export async function readPdfText(file: StoredFile, index: number): Promise<PdfTextBlock[]> {
  return androidOutput().readPdfText(file.uri, index);
}

export async function searchPdfPages(file: StoredFile, query: string, first: number, count: number): Promise<PdfSearchHit[]> {
  return androidOutput().searchPdfPages(file.uri, query, first, count);
}

export async function renderPdfThumbnails(file: StoredFile, first: number, count: number): Promise<PdfThumbnail[]> {
  return androidOutput().renderPdfThumbnails(file.uri, first, count);
}

export async function writePdfPageImage(file: StoredFile, index: number, destination: string, format: 'jpeg' | 'png') {
  await androidOutput().savePdfPageImage(file.uri, index, destination, format);
}

export function supportsPdfTextEditing() {
  return requireOptionalNativeModule<OutputModule>('OmniOutput')?.supportsPdfTextEditing === true;
}

export async function inspectPdfRuns(file: StoredFile, index: number) {
  return androidOutput().inspectPdfRuns(file.uri, index);
}

export async function previewPdfEdit(file: StoredFile, index: number, run: EditableRun, replacement: string) {
  return androidOutput().previewPdfEdit(file.uri, index, run.id, run.text, replacement);
}
