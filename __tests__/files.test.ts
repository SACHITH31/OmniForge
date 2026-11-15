import { convertImage, imageToPdf, loadFiles } from '../src/core/files';

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
