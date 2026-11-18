import { exportOutput, openOutput } from '../src/core/androidOutput';
import type { StoredFile } from '../src/core/types';

const mockNative = { copyToDocument: jest.fn(), open: jest.fn() };
const mockSaf = { requestDirectoryPermissionsAsync: jest.fn(), createFileAsync: jest.fn(), deleteAsync: jest.fn() };
const mockInfo = jest.fn();
const mockContentUri = jest.fn();

jest.mock('expo', () => ({
  requireOptionalNativeModule: () => mockNative,
}));
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: (...args: unknown[]) => mockInfo(...args),
  getContentUriAsync: (...args: unknown[]) => mockContentUri(...args),
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: (...args: unknown[]) => mockSaf.requestDirectoryPermissionsAsync(...args),
    createFileAsync: (...args: unknown[]) => mockSaf.createFileAsync(...args),
    deleteAsync: (...args: unknown[]) => mockSaf.deleteAsync(...args),
  },
}));

const file: StoredFile = {
  id: '1', name: 'converted.pdf', uri: 'file:///documents/omniforge/converted.pdf',
  mimeType: 'application/pdf', bytes: 42, createdAt: '2020-01-01', kind: 'pdf',
};
const directoryUri = 'content://test/tree/export';
const destination = 'content://test/tree/export/document/converted.pdf';

beforeEach(() => {
  jest.resetAllMocks();
  mockInfo.mockResolvedValue({ exists: true, isDirectory: false });
  mockSaf.requestDirectoryPermissionsAsync.mockResolvedValue({ granted: true, directoryUri });
  mockSaf.createFileAsync.mockResolvedValue(destination);
  mockSaf.deleteAsync.mockResolvedValue(undefined);
});

test('opens the saved output with a content URI and its original MIME type', async () => {
  const uri = 'content://test/converted.pdf';
  mockContentUri.mockResolvedValue(uri);
  await openOutput(file);
  expect(mockContentUri).toHaveBeenCalledWith(file.uri);
  expect(mockNative.open).toHaveBeenCalledWith(uri, 'application/pdf');
});

test('exports a copy under the output filename and MIME type', async () => {
  await expect(exportOutput(file)).resolves.toBe(true);
  expect(mockSaf.createFileAsync).toHaveBeenCalledWith(directoryUri, file.name, file.mimeType);
  expect(mockNative.copyToDocument).toHaveBeenCalledWith(file.uri, destination);
  expect(mockSaf.deleteAsync).not.toHaveBeenCalled();
});

test('cancelling the folder picker does not create an output', async () => {
  mockSaf.requestDirectoryPermissionsAsync.mockResolvedValue({ granted: false });
  await expect(exportOutput(file)).resolves.toBe(false);
  expect(mockSaf.createFileAsync).not.toHaveBeenCalled();
});

test('cleans up only the new destination after a failed export', async () => {
  mockNative.copyToDocument.mockRejectedValue(new Error('Storage full'));
  await expect(exportOutput(file)).rejects.toThrow('Storage full');
  expect(mockSaf.deleteAsync).toHaveBeenCalledWith(destination, { idempotent: true });
});

test('missing library files are rejected before launching the folder picker', async () => {
  mockInfo.mockResolvedValue({ exists: false });
  await expect(exportOutput(file)).rejects.toThrow('no longer available');
  expect(mockSaf.requestDirectoryPermissionsAsync).not.toHaveBeenCalled();
});
