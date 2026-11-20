import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { inspectPdfRuns, previewPdfEdit, type EditableRun, type EditedPreview } from '../core/androidOutput';
import { saveEditedPdf } from '../core/files';
import type { StoredFile } from '../core/types';
import { useWorkspaceTheme } from './theme';

function discard(uri?: string) {
  if (uri) void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

export function PdfTextEditor({ file, index, onClose, onSaved }: {
  file: StoredFile; index: number; onClose: () => void; onSaved: (file: StoredFile) => void;
}) {
  const { C, styles } = useWorkspaceTheme();
  const [runs, setRuns] = useState<EditableRun[] | null>(null);
  const [selected, select] = useState<EditableRun | null>(null);
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState<EditedPreview | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const lock = useRef(false);
  const temporary = useRef<string | undefined>(undefined);

  useEffect(() => {
    active.current = true;
    inspectPdfRuns(file, index).then(
      items => { if (active.current) setRuns(items); },
      cause => { if (active.current) setError(cause.message || 'Could not inspect this page.'); },
    );
    return () => { active.current = false; discard(temporary.current); };
  }, [file, index]);

  function change(text: string) {
    discard(temporary.current);
    temporary.current = undefined;
    setPreview(null);
    setShowOriginal(false);
    setError('');
    setValue(text);
  }

  async function apply(save: boolean) {
    if (lock.current || !selected) return;
    lock.current = true;
    setBusy(true);
    setError('');
    Keyboard.dismiss();
    try {
      if (save && preview) {
        const saved = await saveEditedPdf(file, preview.documentUri);
        if (active.current) onSaved(saved);
      } else {
        const next = await previewPdfEdit(file, index, selected, value);
        if (!active.current) { discard(next.documentUri); return; }
        discard(temporary.current);
        temporary.current = next.documentUri;
        setPreview(next);
      }
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : 'The PDF edit could not be completed.');
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }

  return <Modal animationType="slide" onRequestClose={() => { if (!lock.current) onClose(); }}>
    <SafeAreaView style={styles.root}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { maxWidth: 640, gap: 12 }]}>
        <Text style={styles.kicker}>PDF STUDIO · PAGE {index + 1}</Text>
        <Text accessibilityRole="header" style={styles.pageTitle}>Edit existing text</Text>
        {!selected && <>
          <Text style={styles.panelCopy}>Select a line to edit using its original text style.</Text>
          {!runs && !error && <ActivityIndicator accessibilityLabel="Reading text objects" color={C.mint} />}
          {runs?.length === 0 && <Text style={styles.panelCopy}>No supported text objects on this page. Scans, symbol fonts, and complex text need a different editing engine.</Text>}
          {runs?.map(run => <Pressable key={run.id} accessibilityRole="button" accessibilityLabel={`Edit ${run.text.trimEnd()}`}
            style={styles.panel} onPress={() => { select(run); change(run.text); }}>
            <Text style={styles.panelTitle}>{run.text}</Text>
            <Text style={styles.fileMeta}>{run.family} · {run.size.toFixed(1)} pt{run.bold ? ' · Bold' : ''}{run.italic ? ' · Italic' : ''}</Text>
          </Pressable>)}
        </>}
        {selected && <>
          <Text style={styles.fieldLabel}>Replacement text</Text>
          <TextInput accessibilityLabel="Replacement text" value={value} onChangeText={change} editable={!busy}
            selectTextOnFocus maxLength={256} style={[styles.searchBox, { color: C.text, minHeight: 52 }]} />
          <Text style={styles.panelCopy}>{selected.family} · {selected.size.toFixed(1)} pt{selected.bold ? ' · Bold' : ''}{selected.italic ? ' · Italic' : ''} · Original color and placement</Text>
          {preview && <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['Edited', 'Original'] as const).map(label => {
                const chosen = showOriginal === (label === 'Original');
                return <Pressable key={label} accessibilityRole="radio" accessibilityState={{ checked: chosen }}
                  onPress={() => setShowOriginal(label === 'Original')}
                  style={[styles.action, !chosen && styles.actionSecondary, { flex: 1 }]}>
                  <Text style={[styles.actionText, !chosen && { color: C.text }]}>{label}</Text>
                </Pressable>;
              })}
            </View>
            <Image source={{ uri: showOriginal ? preview.originalUri : preview.uri }}
              accessibilityLabel={showOriginal ? 'Original PDF page preview' : 'Edited PDF page preview'} resizeMode="contain"
              style={{ width: '100%', aspectRatio: preview.width / preview.height, backgroundColor: '#fff' }} />
            <Text style={styles.panelCopy}>Review spacing, nearby artwork, and font appearance. Saving creates a separate PDF. Existing digital signatures apply only to the original.</Text>
          </>}
          <Pressable accessibilityRole="button" disabled={busy || !value.trim() || value.trimEnd() === selected.text.trimEnd()}
            accessibilityState={{ disabled: busy || !value.trim() || value.trimEnd() === selected.text.trimEnd() }} onPress={() => apply(!!preview)}
            style={[styles.action, (busy || !value.trim() || value.trimEnd() === selected.text.trimEnd()) && { opacity: 0.5 }]}>
            <Text style={styles.actionText}>{preview ? 'Save edited copy' : 'Preview replacement'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { select(null); change(''); }} style={styles.actionSecondary}>
            <Text style={[styles.actionText, { padding: 14, color: C.text }]}>Choose another line</Text>
          </Pressable>
        </>}
        {busy && <ActivityIndicator accessibilityLabel="Preparing edited PDF" color={C.mint} />}
        {!!error && <Text accessibilityRole="alert" accessibilityLabel={'Edit unavailable. ' + error} style={{ color: C.danger }}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={[styles.action, styles.actionSecondary]}>
          <Text style={[styles.actionText, { color: C.text }]}>Close editor</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
