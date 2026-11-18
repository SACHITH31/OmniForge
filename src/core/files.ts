import { writePdfPageImage } from './androidOutput';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { AppSettings, DEFAULT_SETTINGS, OutputFormat, StoredFile, supportedImage, safeFileName } from './types';

const FILES_KEY = 'omniforge.files.v1';
const SETTINGS_KEY = 'omniforge.settings.v1';
const ROOT = `${FileSystem.documentDirectory}omniforge/`;

async function ensureRoot(): Promise<void> {
  await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true });
}

async function fileSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && !info.isDirectory ? info.size ?? 0 : 0;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function loadFiles(): Promise<StoredFile[]> {
  const raw = await AsyncStorage.getItem(FILES_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((file): file is StoredFile => typeof file?.uri === 'string' && typeof file?.id === 'string') : [];
  } catch {
    return [];
  }
}

// Serialize library writes, including the file operation and its index update.
let pendingWrite: Promise<void> = Promise.resolve();
function writeLibrary<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingWrite.then(operation);
  pendingWrite = result.then(() => undefined, () => undefined);
  return result;
}

async function saveRecord(record: StoredFile): Promise<StoredFile> {
  const previous = await loadFiles();
  await AsyncStorage.setItem(FILES_KEY, JSON.stringify([record, ...previous]));
  return record;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<AppSettings> : {};
    return { jpegQuality: typeof parsed.jpegQuality === 'number' && parsed.jpegQuality >= 0.1 && parsed.jpegQuality <= 1 ? parsed.jpegQuality : DEFAULT_SETTINGS.jpegQuality };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function pickImage(): Promise<DocumentPicker.DocumentPickerAsset | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png'], copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!supportedImage(asset.mimeType, asset.name)) throw new Error('Choose a JPEG or PNG image.');
  return asset;
}

export async function importPdf(): Promise<StoredFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (asset.mimeType !== 'application/pdf' && !asset.name.toLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF document.');
  return writeLibrary(async () => {
    await ensureRoot();
    const id = newId();
    const uri = `${ROOT}${id}.pdf`;
    await FileSystem.copyAsync({ from: asset.uri, to: uri });
    return saveRecord({ id, name: asset.name, uri, mimeType: 'application/pdf', bytes: await fileSize(uri), createdAt: new Date().toISOString(), kind: 'import' });
  });
}

export async function convertImage(asset: DocumentPicker.DocumentPickerAsset, format: OutputFormat, quality: number, kind: 'convert' | 'compress' = 'convert'): Promise<StoredFile> {
  if (!supportedImage(asset.mimeType, asset.name)) throw new Error('Only JPEG and PNG images are supported.');
  return writeLibrary(async () => {
    await ensureRoot();
    const id = newId();
    const saveFormat = format === 'png' ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG;
    const result = await ImageManipulator.manipulateAsync(asset.uri, [], { format: saveFormat, compress: format === 'jpeg' ? quality : 1 });
    const name = `${safeFileName(asset.name)}-${kind === 'compress' ? 'compressed' : 'converted'}.${format === 'jpeg' ? 'jpg' : 'png'}`;
    const uri = `${ROOT}${id}-${name}`;
    await FileSystem.copyAsync({ from: result.uri, to: uri });
    return saveRecord({ id, name, uri, mimeType: format === 'png' ? 'image/png' : 'image/jpeg', bytes: await fileSize(uri), createdAt: new Date().toISOString(), kind });
  });
}

export async function imageToPdf(asset: DocumentPicker.DocumentPickerAsset): Promise<StoredFile> {
  if (!supportedImage(asset.mimeType, asset.name)) throw new Error('Choose a JPEG or PNG image.');
  return writeLibrary(async () => {
    await ensureRoot();
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    const mime = asset.mimeType === 'image/png' || asset.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const html = `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;display:flex;align-items:center;justify-content:center"><img src="data:${mime};base64,${base64}" style="max-width:100%;max-height:100%;object-fit:contain" /></body></html>`;
    const printed = await Print.printToFileAsync({ html });
    const id = newId();
    const name = `${safeFileName(asset.name)}.pdf`;
    const uri = `${ROOT}${id}-${name}`;
    await FileSystem.copyAsync({ from: printed.uri, to: uri });
    return saveRecord({ id, name, uri, mimeType: 'application/pdf', bytes: await fileSize(uri), createdAt: new Date().toISOString(), kind: 'pdf' });
  });
}

export async function savePdfPageImage(file: StoredFile, pageIndex: number, format: OutputFormat): Promise<StoredFile> {
  if (file.mimeType !== 'application/pdf' || !Number.isSafeInteger(pageIndex) || pageIndex < 0) {
    throw new Error('Choose a valid PDF page.');
  }

  return writeLibrary(async () => {
    await ensureRoot();
    const id = newId();
    const name = `${safeFileName(file.name)}-page-${pageIndex + 1}.${format === 'png' ? 'png' : 'jpg'}`;
    const uri = `${ROOT}${id}-${name}`;
    const temporary = `${uri}.part`;
    try {
      await writePdfPageImage(file, pageIndex, temporary, format);
      const bytes = await fileSize(temporary);
      if (bytes < 4) throw new Error('The rendered page could not be saved.');
      await FileSystem.moveAsync({ from: temporary, to: uri });
      return await saveRecord({ id, name, uri, mimeType: format === 'png' ? 'image/png' : 'image/jpeg', bytes, createdAt: new Date().toISOString(), kind: 'convert' });
    } catch (error) {
      await Promise.allSettled([temporary, uri].map(path => FileSystem.deleteAsync(path, { idempotent: true })));
      throw error;
    }
  });
}

export async function shareFile(file: StoredFile): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is unavailable on this device.');
  const info = await FileSystem.getInfoAsync(file.uri);
  if (!info.exists) throw new Error('This file is no longer available.');
  await Sharing.shareAsync(file.uri, { mimeType: file.mimeType, dialogTitle: `Share ${file.name}` });
}

export async function clearFiles(): Promise<void> {
  await writeLibrary(async () => {
    const info = await FileSystem.getInfoAsync(ROOT);
    if (info.exists) await FileSystem.deleteAsync(ROOT, { idempotent: true });
    await AsyncStorage.removeItem(FILES_KEY);
  });
}
