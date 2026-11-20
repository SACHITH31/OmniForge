import { convertImage, imageToPdf, loadFiles, loadSettings, saveSettings, saveEditedPdf, savePdfPageImage, toggleFavorite } from '../src/core/files';

jest.mock('../src/core/androidOutput', () => ({ writePdfPageImage: jest.fn() }));

const memory: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => memory[key] ?? null),
  setItem: jest.fn(async (key: string, value: string) => { memory[key] = value; }),
  removeItem: jest.fn(async (key: string) => { delete memory[key]; }),
}));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
  EncodingType: { Base64: 'base64' },
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  writeAsStringAsync: jest.fn(async () => {}),
  moveAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => 'aGVsbG8='),
  getInfoAsync: jest.fn(async () => ({ exists: true, isDirectory: false, size: 4000 })),
}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { PNG: 'png', JPEG: 'jpeg' },
  manipulateAsync: jest.fn(async () => ({ uri: 'file:///cache/result.jpg' })),
}));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(async () => ({ uri: 'file:///cache/result.pdf' })) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn() }));

const asset = { name: 'Holiday.png', uri: 'file:///cache/holiday.png', mimeType: 'image/png', size: 9000, lastModified: 0 };

beforeEach(() => { for (const key of Object.keys(memory)) delete memory[key]; jest.clearAllMocks(); });

test('converts a supported image and records a persistent output', async () => {
  const manipulator = require('expo-image-manipulator');
  const file = await convertImage(asset, 'jpeg', 0.72);
  expect(manipulator.manipulateAsync).toHaveBeenCalledWith(asset.uri, [], { format: 'jpeg', compress: 0.72 });
  expect(file.name).toBe('Holiday-converted.jpg');
  expect(file.bytes).toBe(4000);
  expect((await loadFiles())[0].id).toBe(file.id);
});

test('rejects an unsupported input before processing', async () => {
  await expect(convertImage({ ...asset, name: 'archive.zip', mimeType: 'application/zip' }, 'png', 1)).rejects.toThrow('Only JPEG and PNG');
});

test('creates a PDF with the chosen image embedded', async () => {
  const print = require('expo-print');
  const file = await imageToPdf(asset);
  expect(print.printToFileAsync).toHaveBeenCalledWith(expect.objectContaining({ html: expect.stringContaining('data:image/png;base64,aGVsbG8=') }));
  expect(file.mimeType).toBe('application/pdf');
  expect((await loadFiles())[0].uri).toBe(file.uri);
});

const pdf = {
  id: 'source', name: 'Invoice.pdf', uri: 'file:///documents/Invoice.pdf',
  mimeType: 'application/pdf', bytes: 1024, createdAt: '2020-01-01', kind: 'import' as const,
};

test.each(['jpeg', 'png'] as const)('writes a separate %s page image before indexing it', async format => {
  const renderer = require('../src/core/androidOutput');
  const fs = require('expo-file-system/legacy');
  renderer.writePdfPageImage.mockResolvedValue(undefined);
  const result = await savePdfPageImage(pdf, 1, format);
  expect(renderer.writePdfPageImage).toHaveBeenCalledWith(pdf, 1, `${result.uri}.part`, format);
  expect(result).toMatchObject({ name: `Invoice-page-2.${format === 'png' ? 'png' : 'jpg'}`, mimeType: `image/${format}` });
  expect(fs.moveAsync).toHaveBeenCalledWith({ from: `${result.uri}.part`, to: result.uri });
  expect(await loadFiles()).toEqual([result]);
  expect(fs.deleteAsync).not.toHaveBeenCalledWith(pdf.uri, expect.anything());
});

test('cleans up partial JPEG output when storage fails and leaves the source intact', async () => {
  const renderer = require('../src/core/androidOutput');
  const fs = require('expo-file-system/legacy');
  renderer.writePdfPageImage.mockResolvedValue(undefined);
  fs.moveAsync.mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(savePdfPageImage(pdf, 0, 'jpeg')).rejects.toThrow('Storage unavailable');
  const destination = fs.moveAsync.mock.calls[0][0].to;
  expect(fs.deleteAsync).toHaveBeenCalledWith(`${destination}.part`, { idempotent: true });
  expect(fs.deleteAsync).toHaveBeenCalledWith(destination, { idempotent: true });
  expect(fs.deleteAsync).not.toHaveBeenCalledWith(pdf.uri, expect.anything());
  expect(await loadFiles()).toEqual([]);
});

test('keeps earlier library entries when concurrent conversions take the index beyond 100', async () => {
  const earlier = Array.from({ length: 100 }, (_, n) => ({ ...pdf, id: String(n) }));
  memory['omniforge.files.v1'] = JSON.stringify(earlier);
  const [one, two] = await Promise.all([convertImage(asset, 'png', 1), convertImage(asset, 'jpeg', 0.72)]);
  expect(await loadFiles()).toEqual([two, one, ...earlier]);
});

test('saves only a native editor working copy and retains its source', async () => {
  await expect(saveEditedPdf(pdf, pdf.uri)).rejects.toThrow('preview');
  const result = await saveEditedPdf(pdf, 'file:///cache/pdf-edits/edit-17.pdf');
  expect(result).toMatchObject({ name: 'Invoice-edited.pdf', mimeType: 'application/pdf' });
  expect(result.uri).not.toBe(pdf.uri);
  expect(await loadFiles()).toEqual([result]);
});

test('favorites a legacy record and preserves simultaneous toggles', async () => {
  memory['omniforge.files.v1'] = JSON.stringify([pdf]);
  expect((await toggleFavorite(pdf.id))[0].favorite).toBe(true);
  await Promise.all([toggleFavorite(pdf.id), toggleFavorite(pdf.id)]);
  expect(await loadFiles()).toEqual([{ ...pdf, favorite: true }]);
  await expect(toggleFavorite('missing')).rejects.toThrow('no longer');
});

test('restores old JPEG settings with system appearance and persists an explicit theme', async () => {
  memory['omniforge.settings.v1'] = JSON.stringify({ jpegQuality: 0.9 });
  expect(await loadSettings()).toEqual({ jpegQuality: 0.9, appearance: 'system' });
  await saveSettings({ jpegQuality: 0.9, appearance: 'dark' });
  expect(await loadSettings()).toEqual({ jpegQuality: 0.9, appearance: 'dark' });
});
