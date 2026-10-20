import React from 'react'
import { act, create } from 'react-test-renderer'
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native'
import { afterEach, expect, it, vi } from 'vitest'
import { __setScrollToImpl, __setWindowDimensions } from '@/test-mocks/react-native'
import { HabitListEmptyState } from '@/components/habit-list/empty-state'
import { HabitCreateFrame } from '@/components/habits/habit-create-frame'
import { HabitCreateActions } from '@/components/habits/habit-create-actions'
import { CalendarHeader } from '@/app/(tabs)/calendar/_components/calendar-shell'
import { CalendarStats } from '@/app/(tabs)/calendar/_components/calendar-stats'
import { Shell412 } from '@/components/shell/shell-412'
import { Composer } from '@/components/shell/composer'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { Fab } from '@/components/ui/fab'
import { createTokensV2 } from '@/lib/theme'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

const safeArea = vi.hoisted(() => ({ top: 0, bottom: 0 }))
vi.mock('react-native-safe-area-context', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-native-safe-area-context')>(),
  useSafeAreaInsets: () => ({ ...safeArea, left: 0, right: 0 }),
}))

const windows = [320, 360, 412, 480, 840, 1100, 1352, 1440].map((width) => ({ width, height: 915 }))
  .concat([{ width: 1200, height: 1600 }, { width: 1600, height: 1200 }])
const tokens = createTokensV2()
const stats = [
  { key: 'best', value: 4, label: ptBR.calendar.bestStreak },
  { key: 'logs', value: 8, label: ptBR.calendar.totalLogs },
  { key: 'missed', value: 2, label: ptBR.calendar.missedCount },
] as const

afterEach(() => {
  __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 })
  __setScrollToImpl(() => {})
  safeArea.top = 0
  safeArea.bottom = 0
})

it.each(windows)('centres Todos actions, calendar navigation and figures at $width by $height', async (viewport) => {
  __setWindowDimensions({ ...viewport, scale: 1, fontScale: 1 })
  let tree!: GeometryTree
  await act(() => { tree = create(<Shell412 nav={false}>
    <HabitListEmptyState title={ptBR.habits.emptyState} description="" actionLabel={ptBR.habits.createManually} onAction={vi.fn()} askAstraLabel={ptBR.habits.askAstra} onAskAstra={vi.fn()} />
    <CalendarHeader currentMonth={new Date(2025, 9, 1)} todayKey="2025-10-10" tokens={tokens} previousMonthLabel="Anterior" nextMonthLabel="Próximo"
      onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()} />
    <CalendarStats stats={stats} />
  </Shell412>) as GeometryTree })
  try {
    const row = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'action-row')[0]!
    expect(StyleSheet.flatten(row.props.style as StyleProp<ViewStyle>).justifyContent).toBe('center')
    const figures = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'calendar-figure-default')
    expect(figures).toHaveLength(3)
    for (const figure of figures) expect(StyleSheet.flatten(figure.props.style as StyleProp<ViewStyle>).alignItems).toBe('flex-start')
    const boxes = measureSafeArea(tree.toJSON(), (host) => host.props.testID, viewport)
    for (const key of ['calendar-header-group', 'calendar-month-navigation', 'calendar-stats']) {
      const box = boxes.get(key)!
      expect(box.left + box.width / 2).toBeCloseTo(viewport.width / 2, 0)
    }
  } finally { await act(() => tree.unmount()) }
})

it.each(windows)('centres the capped create form with its submit at $width by $height', async (viewport) => {
  __setWindowDimensions({ ...viewport, scale: 1, fontScale: 1 })
  let tree!: GeometryTree
  await act(() => { tree = create(<HabitCreateFrame presentation="screen" open fromConversation={false} leaving={false}
    actions={<HabitCreateActions presentation="screen" pending={false} empty={false} subHabit={false} onCancel={vi.fn()} onSubmit={vi.fn()} />}>
    <View testID="form" style={{ height: 100 }} />
  </HabitCreateFrame>) as GeometryTree })
  try {
    const boxes = measureSafeArea(tree.toJSON(), (host) => host.props.testID, viewport)
    const form = boxes.get('form')!
    const submit = boxes.get('button-primary-md')!
    expect(form.width).toBe(Math.min(viewport.width, 592) - 32)
    expect(form.left + form.width / 2).toBeCloseTo(viewport.width / 2, 0)
    expect(submit.left + submit.width / 2).toBeCloseTo(viewport.width / 2, 0)
  } finally { await act(() => tree.unmount()) }
})

it.each(windows)('keeps the floating add target outside every scrolling control at $width by $height', async (viewport) => {
  __setWindowDimensions({ ...viewport, scale: 1, fontScale: 1 })
  let tree!: GeometryTree
  await act(() => { tree = create(<Shell412 tabBar={<View style={{ height: 80 }} />}
    fab={<Fab label="Criar" onClick={vi.fn()}>+</Fab>}>
    <View testID="control-region" style={{ flex: 1 }} />
  </Shell412>) as GeometryTree })
  try {
    const boxes = measureSafeArea(tree.toJSON(), (host) => host.props.testID, viewport)
    const control = boxes.get('control-region')!
    const fab = boxes.get('fab')!
    expect(fab.width).toBe(60)
    expect(fab.top).toBeGreaterThanOrEqual(control.bottom)
    const band = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'shell-fab-band')[0]!
    expect(StyleSheet.flatten(band.props.style as StyleProp<ViewStyle>).position).toBe('absolute')
  } finally { await act(() => tree.unmount()) }
})

it.each([{ width: 840, height: 240 }, { width: 360, height: 320 }].flatMap(viewport =>
  [{ top: 0, bottom: 0 }, { top: 24, bottom: 16 }].map(insets => ({ ...viewport, ...insets })),
))(
  'keeps the real composer and bottom controls reachable at $width by $height with insets $top/$bottom', async (viewport) => {
    safeArea.top = viewport.top
    safeArea.bottom = viewport.bottom
    __setWindowDimensions({ ...viewport, scale: 1, fontScale: 1 })
    const scrollTo = vi.fn()
    __setScrollToImpl(scrollTo)
    const items = ['hoje', 'calendario', 'progresso', 'perfil'].map(id => ({ id, label: id, icon: () => <View style={{ width: 24, height: 24 }} /> }))
    let tree!: GeometryTree
    await act(() => { tree = create(<Shell412
      header={<View testID="header-control" style={{ height: 48 }} />}
      composer={<Composer state="idle" value="Ler" suggestions={[]} words={ptBR.shell.composer}
        onChangeValue={vi.fn()} onSend={vi.fn()} onAttachFile={vi.fn()}
        attachWords={{ ...ptBR.shell.composer.attach, remove: name => name }} onOpenConversation={vi.fn()} conversationLabel="Astra" />}
      fab={<Fab label="Criar" onClick={vi.fn()}>+</Fab>}
      tabBar={<BottomTabBar items={items} activeId="hoje" onSelect={vi.fn()} label="Navegação" />}>
      <View testID="control-region" style={{ flex: 1 }} />
    </Shell412>) as GeometryTree })
    try {
      const shell = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'shell-412')[0]!
      const reportShellLayout = shell.props.onLayout as (event: Pick<LayoutChangeEvent, 'nativeEvent'>) => void
      await act(() => reportShellLayout({ nativeEvent: { layout: { x: 0, y: 0, width: viewport.width, height: viewport.height } } }))
      const boxes = measureSafeArea(tree.toJSON(), host => host.props.testID, viewport)
      const page = boxes.get('control-region')!
      expect(page.bottom - page.top).toBeGreaterThanOrEqual(56)
      const pinned = boxes.get('shell-pinned-slot')!
      expect(pinned.bottom - pinned.top).toBeGreaterThanOrEqual(56)
      const bottomViewport = boxes.get('shell-bottom-viewport')!
      expect(bottomViewport.bottom - bottomViewport.top).toBeGreaterThanOrEqual(64)
      const composer = boxes.get('composer-idle')!
      const maximumScroll = Math.max(0, composer.bottom - bottomViewport.bottom)
      const host = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'shell-bottom-viewport')[0]!
      expect(host.props.nestedScrollEnabled).toBe(true)
      const reportLayout = host.props.onLayout as (event: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => void
      const reportContent = host.props.onContentSizeChange as (width: number, height: number) => void
      await act(() => {
        reportLayout({ nativeEvent: { layout: { x: bottomViewport.left, y: bottomViewport.top, width: bottomViewport.width, height: bottomViewport.bottom - bottomViewport.top } } })
        reportContent(bottomViewport.width, composer.bottom - bottomViewport.top)
      })
      const offset = scrollTo.mock.lastCall![0].y as number
      expect(boxes.get('composer-field')!.top - offset).toBeGreaterThanOrEqual(bottomViewport.top)
      expect(boxes.get('composer-field')!.bottom - offset).toBeLessThanOrEqual(bottomViewport.bottom)
      for (const key of ['fab', 'composer-field', 'composer-send-accent', 'composer-controls']) {
        const control = boxes.get(key)!
        const offset = Math.min(maximumScroll, Math.max(0, control.bottom - bottomViewport.bottom))
        expect(control.top - offset, key).toBeGreaterThanOrEqual(bottomViewport.top)
        expect(control.bottom - offset, key).toBeLessThanOrEqual(bottomViewport.bottom)
      }
      const fab = boxes.get('fab')!
      expect(fab.top).toBeGreaterThanOrEqual(boxes.get('control-region')!.bottom)
      expect(fab.top).toBeGreaterThanOrEqual(boxes.get('header-control')!.bottom)
      expect(fab.bottom).toBeLessThanOrEqual(pinned.top)
      expect(bottomViewport.top).toBeGreaterThanOrEqual(boxes.get('control-region')!.bottom)
      const flow = boxes.get('shell-flow-viewport')!
      const background = boxes.get('shell-background')!
      expect(boxes.get('bottom-tab-destinations')!.bottom).toBeLessThanOrEqual(background.bottom)
      const outerScroll = Math.max(0, background.bottom - flow.bottom)
      if (outerScroll > 0) {
        const host = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'shell-flow-viewport')[0]!
        expect(host.props.scrollEnabled).toBe(true)
      }
      expect(boxes.get('bottom-tab-destinations')!.bottom - outerScroll).toBeLessThanOrEqual(viewport.height - viewport.bottom)
    } finally { await act(() => tree.unmount()) }
  },
)
