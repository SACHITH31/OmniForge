import { formatBytes, safeFileName, supportedImage } from '../src/core/types';

test('formats file sizes consistently', () => {
  expect(formatBytes(0)).toBe('0 B');
  expect(formatBytes(1024)).toBe('1.0 KB');
  expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  expect(formatBytes(-1)).toBe('Unknown size');
});

test('restricts image inputs to supported formats', () => {
  expect(supportedImage('image/png', 'photo.png')).toBe(true);
  expect(supportedImage('image/jpeg', 'photo.jpg')).toBe(true);
  expect(supportedImage('application/pdf', 'notes.pdf')).toBe(false);
  expect(supportedImage(undefined, 'photo.webp')).toBe(false);
});

test('generates safe output names', () => {
  expect(safeFileName('my photo (1).png')).toBe('my-photo-1');
  expect(safeFileName('../')).toBe('file');
});
