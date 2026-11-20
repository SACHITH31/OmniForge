import type { StoredFile } from './types';

export type FileFilter = 'All' | 'Favorites' | 'PDF' | 'Images';
export type FileOrder = 'Newest' | 'Name' | 'Largest';

export function queryFiles(files: StoredFile[], search: string, filter: FileFilter, order: FileOrder) {
  const term = search.trim().toLocaleLowerCase();
  const items = files.filter(file => {
    if (!file.name.toLocaleLowerCase().includes(term)) return false;
    if (filter === 'Favorites') return !!file.favorite;
    if (filter === 'PDF') return file.mimeType === 'application/pdf';
    if (filter === 'Images') return file.mimeType.startsWith('image/');
    return true;
  });
  if (order === 'Name') return items.sort((a, b) => a.name.localeCompare(b.name));
  if (order === 'Largest') return items.sort((a, b) => b.bytes - a.bytes);
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
