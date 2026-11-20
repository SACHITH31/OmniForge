import { queryFiles } from '../src/core/libraryQuery';
import type { StoredFile } from '../src/core/types';

const items: StoredFile[] = [
  { id: '1', name: 'Memo.pdf', bytes: 200, createdAt: '2026-01-01', mimeType: 'application/pdf', kind: 'import', uri: 'a' },
  { id: '2', name: 'Badge.jpg', bytes: 100, createdAt: '2026-02-01', mimeType: 'image/jpeg', kind: 'convert', uri: 'b', favorite: true },
];
test('combines filters with search and sorts without modifying the input', () => {
  expect(queryFiles(items, '  BaD ', 'Favorites', 'Name')).toEqual([items[1]]);
  expect(queryFiles(items, 'badge', 'PDF', 'Newest')).toEqual([]);
  expect(queryFiles(items, '', 'All', 'Newest')).toEqual([items[1], items[0]]);
  expect(queryFiles(items, '', 'All', 'Largest')).toEqual(items);
});
