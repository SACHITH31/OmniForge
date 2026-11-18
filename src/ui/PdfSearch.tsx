import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { searchPdfPages, type PdfSearchHit } from '../core/androidOutput';
import type { StoredFile } from '../core/types';
import { useWorkspaceTheme } from './theme';

const BATCH_SIZE = 12;
const MAX_HITS = 200;

export function PdfSearch({ file, pageCount, onClose, onSelect }: {
  file: StoredFile;
  pageCount: number;
  onClose: () => void;
  onSelect: (index: number) => void;
}) {
  const { C, styles } = useWorkspaceTheme();
  const request = useRef(0);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PdfSearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => () => { request.current += 1; }, []);

  function changeQuery(value: string) {
    request.current += 1;
    setQuery(value);
    setBusy(false);
    setError(false);
    setHits([]);
    setStatus('');
  }

  async function find() {
    const term = query.trim();
    if (!term || busy) return;
    const id = ++request.current;
    Keyboard.dismiss();
    setBusy(true);
    setError(false);
    setHits([]);
    setStatus('');
    try {
      const matches: PdfSearchHit[] = [];
      let limited = false;
      for (let start = 0; start < pageCount; start += BATCH_SIZE) {
        const count = Math.min(BATCH_SIZE, pageCount - start);
        const batch = await searchPdfPages(file, term, start, count);
        if (id !== request.current) return;
        matches.push(...batch);
        if (matches.length >= MAX_HITS) {
          limited = matches.length > MAX_HITS || start + count < pageCount;
          break;
        }
      }
      setHits(matches.slice(0, MAX_HITS));
      setStatus(limited ? 'Showing the first 200 matching pages. Refine your search to narrow the results.' :
        matches.length === 0 ? 'No matches in the PDF text layer.' :
        `${matches.length} matching ${matches.length === 1 ? 'page' : 'pages'}`);
    } catch {
      if (id !== request.current) return;
      setError(true);
      setStatus('Could not search this PDF.');
    } finally {
      if (id === request.current) setBusy(false);
    }
  }

  return <Modal transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0008' }}>
      <View accessibilityViewIsModal style={[styles.panel, { width: '100%', maxWidth: 480, maxHeight: '84%', alignSelf: 'center', gap: 12 }]}>
        <Text accessibilityRole="header" style={styles.panelTitle}>Find in PDF</Text>
        <View style={styles.searchBox}>
          <TextInput accessibilityLabel="PDF search query" placeholder="Search the text layer"
            placeholderTextColor={C.muted} value={query} onChangeText={changeQuery}
            maxLength={120} returnKeyType="search" onSubmitEditing={find} style={styles.searchInput} />
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !query.trim() }}
          disabled={busy || !query.trim()} onPress={find} style={[styles.action, (busy || !query.trim()) && { opacity: 0.5 }]}>
          <Text style={styles.actionText}>Search document</Text>
        </Pressable>
        {busy && <ActivityIndicator accessibilityLabel="Searching PDF" color={C.mint} />}
        {!!status && <Text accessibilityLiveRegion="polite" accessibilityRole={error ? 'alert' : undefined}
          style={styles.panelCopy}>{status}</Text>}
        {hits.length > 0 && <ScrollView keyboardShouldPersistTaps="handled">
          {hits.map(hit => <Pressable key={hit.pageIndex} accessibilityRole="button"
            onPress={() => onSelect(hit.pageIndex)} style={[styles.action, styles.actionSecondary, { marginBottom: 8 }]}>
            <Text style={[styles.actionText, { color: C.text }]}>
              {`Page ${hit.pageIndex + 1} · ${hit.count} ${hit.count === 1 ? 'match' : 'matches'}`}
            </Text>
          </Pressable>)}
        </ScrollView>}
        <Pressable accessibilityRole="button" onPress={onClose} style={[styles.action, styles.actionSecondary]}>
          <Text style={[styles.actionText, { color: C.text }]}>Close search</Text>
        </Pressable>
      </View>
    </View>
  </Modal>;
}
