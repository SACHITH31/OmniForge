import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { renderPdfThumbnails, type PdfThumbnail } from '../core/androidOutput';
import type { StoredFile } from '../core/types';
import { useWorkspaceTheme } from './theme';

const BATCH_SIZE = 8;

export function PdfThumbnails({ file, pageCount, current, onClose, onSelect }: {
  file: StoredFile;
  pageCount: number;
  current: number;
  onClose: () => void;
  onSelect: (page: number) => void;
}) {
  const { C, styles } = useWorkspaceTheme();
  const [first, setFirst] = useState(Math.floor(current / BATCH_SIZE) * BATCH_SIZE);
  const [items, setItems] = useState<PdfThumbnail[] | null>(null);
  const [failed, setFailed] = useState(false);
  const count = Math.min(BATCH_SIZE, pageCount - first);
  useEffect(() => {
    let active = true;
    setItems(null);
    setFailed(false);
    renderPdfThumbnails(file, first, count).then(
      pages => { if (active) setItems(pages); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [file, first, count]);

  return <Modal transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#0008' }}>
      <View accessibilityViewIsModal style={[styles.panel, { width: '100%', maxWidth: 520, maxHeight: '86%', alignSelf: 'center', gap: 12 }]}>
        <Text accessibilityRole="header" style={styles.panelTitle}>PDF pages</Text>
        <Text accessibilityLiveRegion="polite" style={styles.panelCopy}>Pages {first + 1}–{first + count} of {pageCount}</Text>
        {failed && <Text accessibilityRole="alert" style={styles.panelCopy}>These thumbnails could not be rendered.</Text>}
        {!items && !failed && <ActivityIndicator accessibilityLabel="Loading PDF thumbnails" color={C.mint} />}
        {items && <ScrollView contentContainerStyle={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {items.map(item => <Pressable key={item.pageIndex} accessibilityRole="button"
            accessibilityLabel={`Open page ${item.pageIndex + 1}`} accessibilityState={{ selected: item.pageIndex === current }}
            onPress={() => onSelect(item.pageIndex)} style={{
              flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: 12, padding: 8,
              borderColor: item.pageIndex === current ? C.mint : C.border, backgroundColor: C.raised,
            }}>
            <Image source={{ uri: item.uri }} resizeMode="contain" style={{ width: '100%', height: 104 }} />
            <Text style={[styles.fileMeta, { textAlign: 'center', marginTop: 8 }]}>Page {item.pageIndex + 1}</Text>
          </Pressable>)}
        </ScrollView>}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[{ label: 'Earlier pages', next: first - BATCH_SIZE, disabled: first === 0 },
            { label: 'Later pages', next: first + BATCH_SIZE, disabled: first + count >= pageCount }].map(control =>
            <Pressable key={control.label} accessibilityRole="button" accessibilityState={{ disabled: control.disabled }}
              disabled={control.disabled} onPress={() => setFirst(control.next)}
              style={[styles.action, styles.actionSecondary, { flex: 1, opacity: control.disabled ? 0.5 : 1 }]}>
              <Text style={[styles.actionText, { color: C.text, textAlign: 'center' }]}>{control.label}</Text>
            </Pressable>)}
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={[styles.action, styles.actionSecondary]}>
          <Text style={[styles.actionText, { color: C.text }]}>Close thumbnails</Text>
        </Pressable>
      </View>
    </View>
  </Modal>;
}
