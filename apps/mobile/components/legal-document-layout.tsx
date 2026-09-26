import { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBar } from '@/components/ui/app-bar'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export type LegalDocumentSection = Readonly<{
  id: string
  title: string
  paragraphs: readonly string[]
}>

type LegalDocumentLayoutProps = Readonly<{
  title: string
  lastUpdated: string
  sections: readonly LegalDocumentSection[]
  closingNote: LegalDocumentSection
  backLabel: string
  onBack: () => void
}>

export function LegalDocumentLayout({ title, lastUpdated, sections, closingNote, backLabel, onBack }: LegalDocumentLayoutProps) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const { width } = useWindowDimensions()

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.bg }]} edges={['top', 'bottom']}>
      <AppBar backLabel={backLabel} onBack={onBack} title={title} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View testID="legal-document" style={styles.document}>
          <View style={styles.titleBlock}>
            <Text style={[styles.title, width >= 640 ? styles.titleWide : undefined, { color: tokens.fg1 }]}>{title}</Text>
            <Text style={[styles.updated, { color: tokens.fg3 }]}>{lastUpdated}</Text>
          </View>
          <View testID="legal-document-sections" style={styles.sections}>
            {sections.map((section) => (
              <View key={section.id} style={styles.section}>
                <Text accessibilityRole="header" testID="legal-document-section-title" style={[styles.sectionTitle, { color: tokens.fg1 }]}>{section.title}</Text>
                <View style={styles.paragraphs}>
                  {section.paragraphs.map((paragraph) => (
                    <Text key={paragraph} style={[styles.body, { color: tokens.fg2 }]}>{paragraph}</Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
          <View testID="legal-document-closing" style={styles.section}>
            <Text accessibilityRole="header" style={[styles.sectionTitle, { color: tokens.fg1 }]}>{closingNote.title}</Text>
            {closingNote.paragraphs.map((paragraph) => (
              <Text key={paragraph} style={[styles.closingBody, { color: tokens.fg1 }]}>{paragraph}</Text>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, minWidth: 0 },
  scroll: { flex: 1, minWidth: 0 },
  scrollContent: { minWidth: 0 },
  document: { alignSelf: 'center', width: '100%', maxWidth: 620, minWidth: 0, padding: 16, paddingBottom: 24, gap: 24 },
  titleBlock: { minWidth: 0, gap: 8 },
  title: { minWidth: 0, fontFamily: 'SpaceGrotesk_500Medium', fontSize: 22, lineHeight: 26.4, letterSpacing: -0.44 },
  titleWide: { fontSize: 28, lineHeight: 32.2, letterSpacing: -0.56 },
  updated: { minWidth: 0, fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8 },
  sections: { minWidth: 0, gap: 24 },
  section: { minWidth: 0, gap: 8 },
  sectionTitle: { minWidth: 0, fontFamily: 'Geist_500Medium', fontSize: 17, lineHeight: 24 },
  paragraphs: { minWidth: 0, gap: 8 },
  body: { minWidth: 0, maxWidth: '100%', flexShrink: 1, fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 25.6 },
  closingBody: { minWidth: 0, maxWidth: '100%', flexShrink: 1, fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24.8 },
})
