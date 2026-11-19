import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { readTextPreview } from '../core/androidOutput';
import type { StoredFile } from '../core/types';
import { useWorkspaceTheme } from './theme';

export function TextPreview({ file }: { file: StoredFile }) {
  const { styles, C } = useWorkspaceTheme();
  const [preview, setPreview] = useState<{ text: string; truncated: boolean } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    readTextPreview(file).then(
      value => { if (active) setPreview(value); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [file]);

  return <View style={{ marginVertical: 12 }}>
    {failed ? <Text accessibilityRole="alert" style={styles.hint}>The saved text file could not be opened.</Text> :
      !preview ? <ActivityIndicator accessibilityLabel="Loading text preview" color={C.mint} /> :
      <><Text selectable style={styles.panelCopy}>{preview.text.replace(/\f/g, '\n')}</Text>
        {preview.truncated && <Text style={styles.hint}>This preview shows the first 8,192 characters. Open or export the complete file.</Text>}</>}
  </View>;
}
