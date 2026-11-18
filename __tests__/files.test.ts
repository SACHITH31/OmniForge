import { convertImage, imageToPdf, loadFiles, savePdfPageAsJpeg } from '../src/core/files';

jest.mock('../src/core/androidOutput', () => ({ renderPdfPage: jest.fn() }));

const memory: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => memory[key] ?? null),
  setItem: jest.fn(async (key: string, value: string) => { memory[key] = value; }),
  removeItem: jest.fn(async (key: string) => { delete memory[key]; }),
}));
jest.mock('expo-file-system/legacy', () => ({
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

test('writes the chosen PDF page as a separate JPEG and records it after moving it into place', async () => {
  const renderer = require('../src/core/androidOutput');
  const fs = require('expo-file-system/legacy');
  renderer.renderPdfPage.mockResolvedValue({ uri: 'data:image/jpeg;base64,/9j/2Q==' });
  const result = await savePdfPageAsJpeg(pdf, 1);
  expect(renderer.renderPdfPage).toHaveBeenCalledWith(pdf, 1, 1800);
  expect(result).toMatchObject({ name: 'Invoice-page-2.jpg', mimeType: 'image/jpeg' });
  expect(fs.writeAsStringAsync).toHaveBeenCalledWith(`${result.uri}.part`, '/9j/2Q==', { encoding: 'base64' });
  expect(fs.moveAsync).toHaveBeenCalledWith({ from: `${result.uri}.part`, to: result.uri });
  expect(await loadFiles()).toEqual([result]);
  expect(fs.deleteAsync).not.toHaveBeenCalledWith(pdf.uri, expect.anything());
});

test('cleans up partial JPEG output when storage fails and leaves the source intact', async () => {
  const renderer = require('../src/core/androidOutput');
  const fs = require('expo-file-system/legacy');
  renderer.renderPdfPage.mockResolvedValue({ uri: 'data:image/jpeg;base64,/9j/2Q==' });
  fs.moveAsync.mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(savePdfPageAsJpeg(pdf, 0)).rejects.toThrow('Storage unavailable');
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
