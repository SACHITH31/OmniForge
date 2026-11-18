import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, BackHandler, Image, Pressable, ScrollView, Text, TextInput, useColorScheme, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { clearFiles, convertImage, imageToPdf, importPdf, loadFiles, loadSettings, pickImage, saveSettings, shareFile } from './src/core/files';
import { exportOutput, openOutput, renderPdfPage, type PdfPage } from './src/core/androidOutput';
import { themes, useWorkspaceTheme, WorkspaceTheme } from './src/ui/theme';
import { AppSettings, DEFAULT_SETTINGS, formatBytes, OutputFormat, StoredFile } from './src/core/types';

type Screen = 'Home' | 'Convert' | 'PDF Studio' | 'Image Tools' | 'Recent' | 'Settings';
type ResultRoute = { file: StoredFile; from: Screen };
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const tabs: { name: Screen; icon: IconName }[] = [
  { name: 'Home', icon: 'grid-outline' }, { name: 'Convert', icon: 'swap-horizontal-outline' },
  { name: 'PDF Studio', icon: 'document-text-outline' }, { name: 'Image Tools', icon: 'images-outline' },
  { name: 'Recent', icon: 'time-outline' }, { name: 'Settings', icon: 'settings-outline' },
];

function ToolCard({ icon, title, description, tone, onPress, wide }: { icon: IconName; title: string; description: string; tone: string; onPress: () => void; wide?: boolean }) {
  const { C, styles } = useWorkspaceTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.toolCard, wide && { width: '100%' }, pressed && { opacity: 0.74, transform: [{ scale: 0.985 }] }]}>
    <View style={[styles.iconBox, { backgroundColor: `${tone}1E` }]}><Ionicons name={icon} size={25} color={tone} /></View>
    <Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardDescription}>{description}</Text>
    <Ionicons name="arrow-forward" color={tone} size={18} style={{ marginTop: 15 }} />
  </Pressable>;
}

function Action({ label, icon, onPress, secondary, disabled }: { label: string; icon?: IconName; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  const { C, styles } = useWorkspaceTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, secondary && styles.actionSecondary, disabled && { opacity: 0.5 }, pressed && { opacity: 0.75 }]}>
    {icon && <Ionicons name={icon} size={18} color={secondary ? C.text : C.bg} />}
    <Text style={[styles.actionText, secondary && { color: C.text }]}>{label}</Text>
  </Pressable>;
}

function FileRow({ file, onShare, onOpen }: { file: StoredFile; onShare: () => void; onOpen: () => void }) {
  const { C, styles } = useWorkspaceTheme();
  const icon: IconName = file.mimeType === 'application/pdf' ? 'document-text-outline' : 'image-outline';
  return <View style={styles.fileRow}>
    <View style={[styles.fileIcon, { backgroundColor: file.mimeType === 'application/pdf' ? `${C.purple}1E` : `${C.mint}1E` }]}><Ionicons name={icon} size={22} color={file.mimeType === 'application/pdf' ? C.purple : C.mint} /></View>
    <Pressable style={{ flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={`View ${file.name}`} onPress={onOpen}><Text numberOfLines={1} style={styles.fileName}>{file.name}</Text><Text style={styles.fileMeta}>{formatBytes(file.bytes)} · {new Date(file.createdAt).toLocaleDateString()}</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Share ${file.name}`} onPress={onShare} hitSlop={10} style={styles.shareButton}><Ionicons name="share-outline" size={21} color={C.mint} /></Pressable>
  </View>;
}

export default function App() {
  const theme = themes[useColorScheme() === 'light' ? 'light' : 'dark'];
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <WorkspaceTheme.Provider value={theme}><Workspace /></WorkspaceTheme.Provider>
  </SafeAreaProvider>;
}

function Workspace() {
  const { C, styles, mode } = useWorkspaceTheme();
  const [screen, setScreen] = useState<Screen>('Home');
  const [resultRoute, setResultRoute] = useState<ResultRoute | null>(null);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [fileSearch, setFileSearch] = useState('');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState<string | null>(null);
  const [format, setFormat] = useState<OutputFormat>('jpeg');
  const { width } = useWindowDimensions();
  const fade = useRef(new Animated.Value(1)).current;
  const wide = width >= 680;
  const visibleFiles = files.filter(file => file.name.toLowerCase().includes(fileSearch.trim().toLowerCase()));

  const refresh = useCallback(async () => setFiles(await loadFiles()), []);
  useEffect(() => { refresh().catch(() => {}); loadSettings().then(setSettings).catch(() => {}); }, [refresh]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (resultRoute) {
        setResultRoute(null);
        setScreen(resultRoute.from);
        return true;
      }
      if (screen === 'Home') return false;
      setScreen('Home');
      return true;
    });
    return () => subscription.remove();
  }, [screen, resultRoute]);
  const navigate = (next: Screen) => {
    setResultRoute(null);
    fade.setValue(0);
    setScreen(next);
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  };
  const run = async (label: string, task: () => Promise<StoredFile | null>) => {
    if (busy) return;
    try {
      setBusy(label);
      const result = await task();
      if (result) {
        setResultRoute({ file: result, from: screen });
        await refresh();
      }
    } catch (error) { showError(error); }
    finally { setBusy(null); }
  };
  const showError = (error: unknown) => Alert.alert('Could not complete action', error instanceof Error ? error.message : 'Please try again.');
  const updateQuality = async (quality: number) => {
    const next = { jpegQuality: quality };
    setSettings(next);
    try { await saveSettings(next); } catch (error) { showError(error); }
  };
  const imageTask = (kind: 'convert' | 'compress' | 'pdf') => run(kind === 'pdf' ? 'Creating PDF' : kind === 'compress' ? 'Compressing image' : 'Converting image', async () => {
    const asset = await pickImage();
    if (!asset) return null;
    if (kind === 'pdf') return imageToPdf(asset);
    return convertImage(asset, kind === 'compress' ? 'jpeg' : format, settings.jpegQuality, kind);
  });

  return <SafeAreaView style={styles.root}><StatusBar style={mode === 'light' ? 'dark' : 'light'} />
    <View style={styles.topbar}><View style={styles.brandMark}><Ionicons name="sparkles" size={19} color={C.onAccent} /></View><Text style={styles.brand}>OMNI<Text style={{ color: C.mint }}>FORGE</Text></Text><View style={{ flex: 1 }} /><Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => navigate('Settings')}><Ionicons name="options-outline" size={23} color={C.muted} /></Pressable></View>
    <Animated.View style={{ flex: 1, opacity: fade }}><ScrollView contentContainerStyle={[styles.content, { maxWidth: wide ? 760 : 600 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {resultRoute ? <FileResult key={resultRoute.file.id} file={resultRoute.file} onBack={() => navigate(resultRoute.from)} /> : <>
      {screen === 'Home' && <>
        <View style={styles.hero}><View style={styles.eyebrowRow}><View style={styles.dot} /><Text style={styles.eyebrow}>YOUR OFFLINE WORKSPACE</Text></View><Text style={styles.heroTitle}>Make more of{ '\n' }every file<Text style={{ color: C.mint }}>.</Text></Text><Text style={styles.heroSub}>Convert, compress, and create on your device. Your files stay yours.</Text><Pressable accessibilityRole="button" onPress={() => navigate('Convert')} style={styles.heroCta}><Text style={styles.heroCtaText}>Start creating</Text><Ionicons name="arrow-forward" color={C.onAccent} size={18} /></Pressable><View style={styles.heroOrb} /></View>
        <Section title="Your toolkit" subtitle="Pick a task and get it done" />
        <View style={styles.cardGrid}><ToolCard icon="swap-horizontal-outline" title="Convert files" description="JPEG and PNG conversions" tone={C.mint} onPress={() => navigate('Convert')} /><ToolCard icon="document-text-outline" title="PDF studio" description="Create a PDF from an image" tone={C.purple} onPress={() => navigate('PDF Studio')} /><ToolCard icon="images-outline" title="Image tools" description="Compress photos for sharing" tone={C.blue} onPress={() => navigate('Image Tools')} /><ToolCard icon="time-outline" title="Recent files" description="Everything you made, in one place" tone={C.mint} onPress={() => navigate('Recent')} /></View>
        <Section title="Latest files" subtitle={`${files.length} saved locally`} />
        {files.length ? files.slice(0, 3).map(file => <FileRow key={file.id} file={file} onOpen={() => setResultRoute({ file, from: screen })} onShare={() => shareFile(file).catch(showError)} />) : <Empty text="Your finished files will appear here." />}
      </>}
      {screen === 'Convert' && <><ScreenHeading kicker="CONVERT FILES" title="Change the format." subtitle="Choose a JPEG or PNG image and make a new copy in your preferred format." /><Panel><Text style={styles.fieldLabel}>OUTPUT FORMAT</Text><View style={styles.segment}>{(['jpeg', 'png'] as const).map(value => <Pressable accessibilityRole="radio" accessibilityState={{ checked: format === value }} key={value} onPress={() => setFormat(value)} style={[styles.segmentItem, format === value && styles.segmentActive]}><Text style={[styles.segmentText, format === value && { color: C.onAccent }]}>{value.toUpperCase()}</Text></Pressable>)}</View><Text style={styles.hint}>JPEG uses your saved quality setting. PNG is lossless. Animated images and other document types are not supported.</Text><Action label="Choose image & convert" icon="folder-open-outline" onPress={() => imageTask('convert')} disabled={!!busy} /></Panel></>}
      {screen === 'PDF Studio' && <><ScreenHeading kicker="PDF STUDIO" title="A page from a picture." subtitle="Create a shareable PDF from one JPEG or PNG image, or import an existing PDF into your local library." /><Panel><View style={styles.featureIcon}><Ionicons name="document-text-outline" color={C.purple} size={30} /></View><Text style={styles.panelTitle}>Image to PDF</Text><Text style={styles.panelCopy}>Your image is fitted to a PDF page on your device.</Text><Action label="Choose image & create PDF" icon="add-outline" onPress={() => imageTask('pdf')} disabled={!!busy} /><View style={{ height: 10 }} /><Action label="Import existing PDF" icon="download-outline" secondary onPress={() => run('Importing PDF', importPdf)} disabled={!!busy} /></Panel><Text style={styles.hint}>PDF text editing, page rearrangement, and font preservation are not included in this release.</Text></>}
      {screen === 'Image Tools' && <><ScreenHeading kicker="IMAGE TOOLS" title="Keep the detail. Lose the weight." subtitle="Compress a JPEG or PNG into a smaller JPEG copy. Compare the size when it finishes." /><Panel><Text style={styles.fieldLabel}>JPEG QUALITY · {Math.round(settings.jpegQuality * 100)}%</Text><View style={styles.qualityRow}>{[0.45, 0.72, 0.9].map((value, index) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: settings.jpegQuality === value }} onPress={() => updateQuality(value)} style={[styles.qualityOption, settings.jpegQuality === value && styles.qualitySelected]}><Text style={[styles.qualityText, settings.jpegQuality === value && { color: C.onAccent }]}>{['Small', 'Balanced', 'High'][index]}</Text></Pressable>)}</View><Text style={styles.hint}>Photos with large flat areas may not become smaller. PNG transparency becomes an opaque JPEG.</Text><Action label="Choose image & compress" icon="contract-outline" onPress={() => imageTask('compress')} disabled={!!busy} /></Panel></>}
      {screen === 'Recent' && <><ScreenHeading kicker="YOUR FILES" title="Made here. Kept here." subtitle="Search your locally saved outputs and imported PDFs." /><View style={styles.searchBox}><Ionicons name="search-outline" size={20} color={C.muted} /><TextInput accessibilityLabel="Search saved files" placeholder="Search files" placeholderTextColor={C.muted} value={fileSearch} onChangeText={setFileSearch} autoCorrect={false} style={styles.searchInput} /></View>{visibleFiles.length ? visibleFiles.map(file => <FileRow key={file.id} file={file} onOpen={() => setResultRoute({ file, from: screen })} onShare={() => shareFile(file).catch(showError)} />) : <Empty text={files.length ? 'No files match your search.' : 'No files yet. Create one from the toolkit.'} />}</>}
      {screen === 'Settings' && <><ScreenHeading kicker="SETTINGS" title="Your space, your rules." subtitle="OmniForge processes files on this device and stores outputs locally." /><Panel><Text style={styles.panelTitle}>Default JPEG quality</Text><Text style={styles.panelCopy}>Used for image conversion and compression.</Text><View style={styles.qualityRow}>{[0.45, 0.72, 0.9].map((value, index) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: settings.jpegQuality === value }} onPress={() => updateQuality(value)} style={[styles.qualityOption, settings.jpegQuality === value && styles.qualitySelected]}><Text style={[styles.qualityText, settings.jpegQuality === value && { color: C.onAccent }]}>{['45%', '72%', '90%'][index]}</Text></Pressable>)}</View></Panel><Panel><Text style={styles.panelTitle}>Local library</Text><Text style={styles.panelCopy}>{files.length} saved files. Clearing removes the app's stored copies and history.</Text><Action label="Clear saved files" icon="trash-outline" secondary onPress={() => Alert.alert('Clear saved files?', 'This deletes OmniForge copies from this device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => { clearFiles().then(refresh).catch(showError); } }])} /></Panel><Text style={styles.version}>OmniForge 0.1.0 · Offline first</Text></>}
      </>}
    </ScrollView></Animated.View>
    {busy && <View accessibilityLiveRegion="polite" style={styles.busy}><ActivityIndicator color={C.mint} /><Text style={styles.busyText}>{busy}…</Text></View>}
    <View style={styles.tabBar}>{tabs.map(tab => <Pressable key={tab.name} accessibilityRole="tab" accessibilityState={{ selected: screen === tab.name }} accessibilityLabel={tab.name} onPress={() => navigate(tab.name)} style={styles.tab}><Ionicons name={tab.icon} size={22} color={screen === tab.name ? C.mint : C.muted} /><Text numberOfLines={1} style={[styles.tabText, screen === tab.name && { color: C.mint }]}>{tab.name === 'PDF Studio' ? 'PDF' : tab.name === 'Image Tools' ? 'Images' : tab.name}</Text></Pressable>)}</View>
  </SafeAreaView>;
}

function FileResult({ file, onBack }: {
  const { C, styles } = useWorkspaceTheme();
  file: StoredFile;
  onBack: () => void;
}) {
  const [preview, setPreview] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [pending, setPending] = useState<'share' | 'export' | 'open' | null>(null);
  const [status, setStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const actionLock = useRef(false);
  const isImage = file.mimeType === 'image/jpeg' || file.mimeType === 'image/png';
  async function perform(action: 'share' | 'export' | 'open') {
    if (actionLock.current) return;
    actionLock.current = true;
    setPending(action);
    setStatus('');
    setErrorMessage('');
    try {
      if (action === 'share') await shareFile(file);
      if (action === 'open') await openOutput(file);
      if (action === 'export' && await exportOutput(file)) setStatus('Copy saved to the selected folder.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not complete the file action.');
    } finally {
      actionLock.current = false;
      setPending(null);
    }
  }

  return <>
    <ScreenHeading kicker="SAVED TO YOUR FILES" title={file.name}
      subtitle={`${formatBytes(file.bytes)} · ${file.mimeType}`} />
    <Panel>
      {isImage && preview !== 'failed' && <Image
        source={{ uri: file.uri }}
        style={styles.outputImage}
        resizeMode="contain"
        accessibilityLabel={preview === 'ready' ? `Preview of ${file.name}` : undefined}
        onLoad={() => setPreview('ready')}
        onError={() => setPreview('failed')}
      />}
      <View accessibilityLiveRegion="polite">
        {isImage && preview === 'loading' && <ActivityIndicator accessibilityLabel="Loading image preview" color={C.mint} />}
        {isImage && preview === 'failed' && <Text style={styles.hint}>The saved image could not be displayed.</Text>}
        {file.mimeType === 'application/pdf' && <PdfPreview file={file} />}
        {!isImage && file.mimeType !== 'application/pdf' && <Text style={styles.hint}>Preview is unavailable for this format.</Text>}
      </View>
      <View accessibilityLiveRegion="polite">
        {pending && <ActivityIndicator accessibilityLabel="Preparing file action" color={C.mint} />}
        {!!status && <Text style={styles.hint}>{status}</Text>}
        {!!errorMessage && <Text accessibilityRole="alert" style={[styles.hint, { color: C.danger }]}>{errorMessage}</Text>}
      </View>
      <View style={{ gap: 10 }}>
        <Action label="Share file" icon="share-outline" onPress={() => perform('share')} disabled={!!pending} />
        <Action label="Export a copy" icon="save-outline" onPress={() => perform('export')} disabled={!!pending} secondary />
        <Action label="Open with another app" icon="open-outline" onPress={() => perform('open')} disabled={!!pending} secondary />
      </View>
      <View style={{ height: 10 }} />
      <Action label="Back" icon="arrow-back-outline" onPress={onBack} secondary />
    </Panel>
  </>;
}

function PdfPreview({ file }: { file: StoredFile }) {
  const { C, styles } = useWorkspaceTheme();
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [page, setPage] = useState<PdfPage | null>(null);
  const [error, setError] = useState('');
  const [viewport, setViewport] = useState(0);

  useEffect(() => {
    let active = true;
    setPage(null);
    setError('');
    Promise.resolve().then(() => renderPdfPage(file, index, zoom ? 1600 : 960)).then(
      result => { if (active) setPage(result); },
      () => { if (active) setError('This PDF page could not be rendered. It may be damaged, password protected, or unsupported.'); },
    );
    return () => { active = false; };
  }, [file, index, zoom]);

  const imageWidth = viewport * (zoom ? 1.65 : 1);
  return <View style={{ marginBottom: 16 }} onLayout={event => setViewport(event.nativeEvent.layout.width)}>
    {error ? <Text accessibilityRole="alert" style={styles.hint}>{error}</Text> : null}
    {!page && !error && <ActivityIndicator accessibilityLabel="Rendering PDF page" color={C.mint} />}
    {page && <>
      <ScrollView horizontal>
        <Image source={{ uri: page.uri }} resizeMode="contain"
          accessibilityLabel={`PDF preview, page ${index + 1}`}
          style={{ width: imageWidth, height: Math.min(imageWidth * page.height / page.width, 1000), backgroundColor: C.bg }} />
      </ScrollView>
      <Text accessibilityLiveRegion="polite" style={[styles.fileMeta, { marginVertical: 10 }]}>
        Page {index + 1} of {page.pageCount}
      </Text>
      <View style={{ gap: 8 }}>
        {page.pageCount > 1 && <>
          <Action label="Previous page" onPress={() => setIndex(index - 1)} disabled={index === 0} secondary />
          <Action label="Next page" onPress={() => setIndex(index + 1)} disabled={index + 1 === page.pageCount} secondary />
        </>}
        <Action label={zoom ? 'Fit to width' : 'Zoom in'} onPress={() => setZoom(!zoom)} secondary />
      </View>
    </>}
  </View>;
}

function Section({ title, subtitle }: { title: string; subtitle: string }) {
  const { styles } = useWorkspaceTheme();
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionSub}>{subtitle}</Text></View>; }
function ScreenHeading({ kicker, title, subtitle }: { kicker: string; title: string; subtitle: string }) {
  const { styles } = useWorkspaceTheme();
  return <View style={{ marginBottom: 28 }}><Text style={styles.kicker}>{kicker}</Text><Text style={styles.pageTitle}>{title}</Text><Text style={styles.pageSub}>{subtitle}</Text></View>; }
function Panel({ children }: { children: React.ReactNode }) {
  const { styles } = useWorkspaceTheme();
  return <View style={styles.panel}>{children}</View>; }
function Empty({ text }: { text: string }) {
  const { C, styles } = useWorkspaceTheme();
  return <View style={styles.empty}><Ionicons name="file-tray-outline" color={C.muted} size={32} /><Text style={styles.emptyText}>{text}</Text></View>; }

