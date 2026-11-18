import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { queryFiles, type FileFilter, type FileOrder } from '../core/libraryQuery';
import type { StoredFile } from '../core/types';
import { FileRow } from './FileRow';
import { useWorkspaceTheme } from './theme';

export function FileLibrary({ files, onOpen, onShare, onFavorite }: {
  files: StoredFile[]; onOpen: (file: StoredFile) => void;
  onShare: (file: StoredFile) => void; onFavorite: (file: StoredFile) => void;
}) {
  const { C, styles } = useWorkspaceTheme();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FileFilter>('All');
  const [order, setOrder] = useState<FileOrder>('Newest');
  const items = useMemo(() => queryFiles(files, search, filter, order), [files, search, filter, order]);
  return <>
    <Text accessibilityRole="header" style={styles.pageTitle}>Files</Text>
    <Text style={[styles.pageSub, { marginBottom: 18 }]}>{files.length} saved on this device</Text>
    <View style={styles.searchBox}><Ionicons name="search-outline" size={20} color={C.muted} />
      <TextInput accessibilityLabel="Search saved files" placeholder="Search files" placeholderTextColor={C.muted}
        value={search} onChangeText={setSearch} autoCorrect={false} style={styles.searchInput} />
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {(['All', 'Favorites', 'PDF', 'Images'] as const).map(item => <Pressable key={item} accessibilityRole="radio"
        accessibilityLabel={`Filter ${item}`} accessibilityState={{ checked: item === filter }} onPress={() => setFilter(item)}
        style={{ minHeight: 48, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 12, backgroundColor: item === filter ? C.mint : C.raised }}>
        <Text style={[styles.qualityText, { color: item === filter ? C.onAccent : C.text }]}>{item}</Text>
      </Pressable>)}
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 }}>
      <Text accessibilityLiveRegion="polite" style={styles.fileMeta}>{items.length} {items.length === 1 ? 'file' : 'files'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Sort by ${order}`} accessibilityHint="Cycles through newest, name and largest"
        onPress={() => setOrder(order === 'Newest' ? 'Name' : order === 'Name' ? 'Largest' : 'Newest')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 8 }}>
        <Ionicons name="swap-vertical-outline" size={18} color={C.muted} /><Text style={styles.qualityText}>{order}</Text>
      </Pressable>
    </View>
    {items.map(file => <FileRow key={file.id} file={file} onOpen={() => onOpen(file)}
      onShare={() => onShare(file)} onFavorite={() => onFavorite(file)} />)}
    {!items.length && <View style={styles.empty}>
      <Ionicons name={filter === 'Favorites' ? 'star-outline' : 'folder-open-outline'} size={30} color={C.muted} />
      <Text style={styles.emptyText}>{!files.length ? 'Import a PDF or convert an image to save your first file.'
        : filter === 'Favorites' && !search ? 'Star a file to find it here and on Home.' : 'No files match these filters.'}</Text>
    </View>}
  </>;
}
