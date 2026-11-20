import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StoredFile } from '../core/types';
import { supportsPdfTextEditing } from '../core/androidOutput';
import { FileRow } from './FileRow';
import { useWorkspaceTheme } from './theme';

export function PdfStudio({ files, busy, onImport, onCreate, onOpen, onShare }: {
  files: StoredFile[]; busy: boolean; onImport: () => void; onCreate: () => void;
  onOpen: (file: StoredFile) => void; onShare: (file: StoredFile) => void;
}) {
  const { C, styles } = useWorkspaceTheme();
  const recent = files.filter(file => file.mimeType === 'application/pdf').slice(0, 5);
  return <>
    <Text accessibilityRole="header" style={[styles.pageTitle, { marginBottom: 18 }]}>PDF Studio</Text>
    <View style={styles.hero}>
      <View style={[styles.iconBox, { backgroundColor: C.surface }]}><Ionicons name="document-text-outline" size={24} color={C.mint} /></View>
      <Text style={[styles.sectionTitle, { color: C.heroText }]}>Open a document</Text>
      <Text style={styles.heroSub}>{supportsPdfTextEditing()
        ? 'Read, search, or replace supported text in a separate copy.'
        : 'Read a PDF and save individual pages as images.'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Import existing PDF" accessibilityState={{ disabled: busy }}
        disabled={busy} onPress={onImport} style={({ pressed }) => [styles.heroCta, { opacity: pressed || busy ? 0.7 : 1 }]}>
        <Ionicons name="folder-open-outline" color={C.onAccent} size={19} /><Text style={styles.heroCtaText}>Import existing PDF</Text>
      </Pressable>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose image & create PDF" accessibilityState={{ disabled: busy }}
      disabled={busy} onPress={onCreate} style={({ pressed }) => [styles.fileRow, { opacity: busy || pressed ? 0.7 : 1 }]}>
      <View style={[styles.fileIcon, { backgroundColor: C.raised }]}><Ionicons name="images-outline" color={C.purple} size={22} /></View>
      <View style={{ flex: 1 }}><Text style={styles.cardTitle}>Image to PDF</Text><Text style={styles.sectionSub}>Create a page from a JPEG or PNG</Text></View>
      <Ionicons name="chevron-forward" color={C.muted} size={18} />
    </Pressable>
    <View style={styles.section}><Text accessibilityRole="header" style={styles.sectionTitle}>Recent PDFs</Text></View>
    {recent.length ? recent.map(file => <FileRow key={file.id} file={file} onOpen={() => onOpen(file)} onShare={() => onShare(file)} />) :
      <View style={styles.empty}><Ionicons name="documents-outline" size={30} color={C.purple} />
        <Text style={styles.emptyText}>Import or create a PDF to return to it here.</Text></View>}
  </>;
}
