import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatBytes, type StoredFile } from '../core/types';
import { useWorkspaceTheme } from './theme';

export function FileRow({ file, onShare, onOpen, onFavorite }: { file: StoredFile; onShare: () => void; onOpen: () => void; onFavorite?: () => void }) {
  const { C, styles } = useWorkspaceTheme();
  const icon: React.ComponentProps<typeof Ionicons>['name'] = file.mimeType === 'application/pdf' ? 'document-text-outline' : 'image-outline';
  return <View style={styles.fileRow}>
    <View style={[styles.fileIcon, { backgroundColor: file.mimeType === 'application/pdf' ? `${C.purple}1E` : `${C.mint}1E` }]}><Ionicons name={icon} size={22} color={file.mimeType === 'application/pdf' ? C.purple : C.mint} /></View>
    <Pressable style={{ flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={`View ${file.name}`} onPress={onOpen}><Text numberOfLines={1} style={styles.fileName}>{file.name}</Text><Text style={styles.fileMeta}>{formatBytes(file.bytes)} · {new Date(file.createdAt).toLocaleDateString()}</Text></Pressable>
    {onFavorite && <Pressable accessibilityRole="togglebutton" accessibilityState={{ checked: !!file.favorite }}
      accessibilityLabel={`Favorite ${file.name}`} onPress={onFavorite} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={file.favorite ? 'star' : 'star-outline'} color={file.favorite ? C.mint : C.muted} size={20} />
    </Pressable>}
    <Pressable accessibilityRole="button" accessibilityLabel={`Share ${file.name}`} onPress={onShare} hitSlop={10} style={styles.shareButton}><Ionicons name="share-outline" size={21} color={C.mint} /></Pressable>
  </View>;
}

