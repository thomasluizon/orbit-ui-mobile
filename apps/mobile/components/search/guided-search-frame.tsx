import { useEffect, useRef, useState } from 'react'
import { Keyboard, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SHELL_CONTENT_MAX_WIDTH, SPACING } from '@orbit/shared/theme'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { useFlowLookState } from '@/components/ui/flow-look'
import { Search } from '@/components/ui/icons'
import { Input } from '@/components/ui/input'
import { KeyboardAwareSheetScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { PageHeader } from '@/components/ui/page-header'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { SearchList, hasSearchLine } from './search-list'
import { QUESTION_END_GAP, SearchOrbit, SearchQuestion } from './search-question-block'
import type { SearchScreenModel } from './use-search-screen'

const KEYBOARD_LOOK = { x: 0, y: 1 } as const
/** The question and its field stay pinned while the rows scroll under them. */
const PINNED_QUESTION = [1]

function useKeyboardOpen() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setOpen(true))
    const hidden = Keyboard.addListener('keyboardDidHide', () => setOpen(false))
    return () => { shown.remove(); hidden.remove() }
  }, [])
  return open
}

/**
 * The heights that place the block, read from layout: the scroller, Orbit and the question with its field. The visible block runs from the top of
 * Orbit to the bottom of the field, so the gap under the field is left out. The Orbit slot is empty while a query is typed, so its last drawn height
 * is kept, and the block returns to the centre in the same frame when the query is cleared. Until every height is read, the centred block is hidden,
 * so it never shows at the top first.
 */
function useBlockOffset(centred: boolean, endPadding: number) {
  const [heights, setHeights] = useState({ scroller: 0, orbit: 0, question: 0 })
  const read = (part: keyof typeof heights) => (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout
    if (part === 'orbit' && height === 0) return
    setHeights((current) => (current[part] === height ? current : { ...current, [part]: height }))
  }
  const free = heights.scroller - SPACING.s16 - endPadding
  const placed = heights.scroller > 0 && heights.orbit > 0 && heights.question > 0
  return {
    offset: centred ? Math.max(0, (free - heights.orbit - (heights.question - QUESTION_END_GAP)) / 2) : 0,
    hidden: centred && !placed,
    onScrollerLayout: read('scroller'),
    onOrbitLayout: read('orbit'),
    onQuestionLayout: read('question'),
  }
}

/** Where Orbit is drawn: above the question, beside the Orbit line, or nowhere while the line has no job. */
type OrbitPlace = 'block' | 'line' | 'none'

/** Orbit looks at the search field while it holds focus, and at the keyboard while it is open. The look is measured again when Orbit moves between the block and the line. */
function useFieldLook(place: OrbitPlace, keyboardOpen: boolean) {
  const { lookAt, mascotRef, lookAtControl, lookAway } = useFlowLookState()
  const fieldRef = useRef<View>(null)
  const focused = useRef(false)
  useEffect(() => { if (focused.current) lookAtControl(fieldRef) }, [place, lookAtControl])
  return {
    fieldRef,
    mascotRef,
    lookAt: lookAt ?? (keyboardOpen ? KEYBOARD_LOOK : null),
    onFieldFocus: () => { focused.current = true; lookAtControl(fieldRef) },
    onFieldBlur: () => { focused.current = false; lookAway() },
  }
}

/**
 * The search screen on the Orbit logic. Before a query, Orbit, the question and the field form one block in the centre
 * of the free area, and the rows follow it. A block taller than the area, or an open keyboard, aligns it under the header.
 */
export function GuidedSearchFrame({ model }: Readonly<{ model: SearchScreenModel }>) {
  const { t } = useTranslation()
  const clearance = useShellScrollerClearance()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const keyboardOpen = useKeyboardOpen()
  const { search, commandPage } = model
  const resting = commandPage === null && search.text.trim().length === 0
  const { fieldRef, mascotRef, lookAt, onFieldFocus, onFieldBlur } = useFieldLook(resting ? 'block' : hasSearchLine(search) ? 'line' : 'none', keyboardOpen)
  const block = useBlockOffset(resting && !keyboardOpen, clearance + SPACING.s16)
  return <View style={[styles.screen, { backgroundColor: tokens.bg }]}>
    <PageHeader title={t('habits.search.title')} titleHeading={false} onBack={model.back} backLabel={t('common.back')} />
    <KeyboardAwareSheetScrollView testID="search-scroller" stickyHeaderIndices={PINNED_QUESTION} keyboardShouldPersistTaps="handled" onLayout={block.onScrollerLayout}
      contentContainerStyle={[styles.content, { paddingBottom: clearance + SPACING.s16 }]}>
      <SearchOrbit resting={resting} offset={block.offset} hidden={block.hidden} mascotRef={mascotRef} lookAt={lookAt} onLayout={block.onOrbitLayout} />
      <SearchQuestion hidden={block.hidden} onLayout={block.onQuestionLayout}>
        {commandPage !== null && <Text style={[styles.chip, { color: tokens.fg2, backgroundColor: tokens.bgWell, borderColor: tokens.hairline }]}>{t(commandPage === 'log' ? 'command.page.log' : 'command.page.skip')}</Text>}
        <View ref={fieldRef} collapsable={false} onFocus={onFieldFocus} onBlur={onFieldBlur}>
          <Input label={t('habits.search.question')} hideLabel placeholder={t('habits.moveParent.searchPlaceholder')} value={search.text} onChange={search.changeText} trailing={<Search size={20} color={tokens.fg3} />} />
        </View>
      </SearchQuestion>
      <View testID="search-rows" role="list" accessibilityState={{ busy: search.busy }} style={styles.rows}>
        <SearchList model={model} mascotRef={mascotRef} lookAt={lookAt} />
      </View>
    </KeyboardAwareSheetScrollView>
  </View>
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignSelf: 'center', width: '100%', maxWidth: SHELL_CONTENT_MAX_WIDTH },
  content: { flexGrow: 1, alignSelf: 'center', width: '100%', maxWidth: 620, paddingHorizontal: SPACING.s16, paddingTop: SPACING.s16 },
  rows: { gap: 8 },
  chip: { alignSelf: 'flex-start', padding: SPACING.s8, borderRadius: radius.sm, borderWidth: 1, fontFamily: 'Geist_500Medium', fontSize: 12 },
})
