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
import { DestinationHeaderRow } from '@/components/navigation/root-notification-header'
import { Composer } from '@/components/shell/composer'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { Fab } from '@/components/ui/fab'
import { Toast } from '@/components/ui/app-toast'
import { TodayDateControl } from '@/components/today/today-date-control'
import { SPACING, TAB_BAR_MIN_HEIGHT, TOUCH_TARGET_MIN, SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'
import { SHELL_SCROLLER_CLEARANCE } from '@/components/shell/shell-scroller-clearance'
import { createTokensV2 } from '@/lib/theme'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

const safeArea = vi.hoisted(() => ({ top: 0, bottom: 0 }))
vi.mock('react-native-safe-area-context', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-native-safe-area-context')>(),
  useSafeAreaInsets: () => ({ ...safeArea, left: 0, right: 0 }),
}))
vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => null }))

const windows = [320, 360, 412, 480, 740, 840, 1100, 1352, 1440].map((width) => ({ width, height: 915 }))
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

it.each([412, 480, 740, 840, 841, 1100, 1101])('places native shell and create columns on whole points at %ipx', async (width) => {
  const viewport = { width, height: 915 }
  __setWindowDimensions({ ...viewport, scale: 1, fontScale: 1 })
  let tree!: GeometryTree
  await act(() => { tree = create(<HabitCreateFrame presentation="screen" open fromConversation={false} leaving={false}>
    <View testID="form" style={{ height: 100 }} />
  </HabitCreateFrame>) as GeometryTree })
  try {
    const boxes = measureSafeArea(tree.toJSON(), host => host.props.testID, viewport)
    for (const key of ['shell-background', 'form']) {
      const column = boxes.get(key)!
      expect(Number.isInteger(column.left), key).toBe(true)
      expect(Math.abs(column.left + column.width / 2 - width / 2), key).toBeLessThanOrEqual(0.5)
    }
  } finally { await act(() => tree.unmount()) }
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
    const astraAction = row.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && node.findAll(child => String(child.type) === 'Text' && child.props.children === ptBR.habits.askAstra).length > 0)[0]!
    expect(astraAction.findAll(node => String(node.type) === 'Text').map(node => node.props.children)).toEqual([ptBR.habits.askAstra])
    const figures = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'calendar-figure-default')
    expect(figures).toHaveLength(3)
    for (const figure of figures) expect(StyleSheet.flatten(figure.props.style as StyleProp<ViewStyle>).alignItems).toBe('flex-start')
    const boxes = measureSafeArea(tree.toJSON(), (host) => host.props.testID === 'button-primary-sm' ? 'astra-action' : host.props.testID, viewport)
    const actionBounds = boxes.get('astra-action')!
    expect(actionBounds.width).toBeGreaterThan(48)
    expect(actionBounds.bottom - actionBounds.top).toBeGreaterThanOrEqual(SMALL_PILL_VISIBLE_MIN)
    expect(actionBounds.left).toBeGreaterThanOrEqual(0)
    expect(actionBounds.left + actionBounds.width).toBeLessThanOrEqual(viewport.width)
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

it.each(windows)('floats the add target within the page viewport at $width by $height', async (viewport) => {
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
    expect(fab.top).toBeGreaterThanOrEqual(control.top)
    expect(fab.bottom).toBeLessThanOrEqual(control.bottom - 16)
    const band = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'shell-fab-band')[0]!
    expect(StyleSheet.flatten(band.props.style as StyleProp<ViewStyle>).position).toBe('absolute')
  } finally { await act(() => tree.unmount()) }
})

it.each([240, 360])('reserves room for complete Hoje controls at 740 by %ipx', async (height) => {
  const viewport = { width: 740, height }
  __setWindowDimensions({ ...viewport, scale: 1, fontScale: 1 })
  let tree!: GeometryTree
  await act(() => { tree = create(<Shell412 header={<View style={{ height: 48 }} />}
    composer={<Composer state="idle" value="Ler" suggestions={[]} words={ptBR.shell.composer}
      onChangeValue={vi.fn()} onSend={vi.fn()} onAttachFile={vi.fn()}
      attachWords={{ ...ptBR.shell.composer.attach, remove: name => name }} onOpenConversation={vi.fn()} conversationLabel="Astra" />}
    fab={<Fab label="Criar" onClick={vi.fn()}>+</Fab>} tabBar={<View style={{ height: 80 }} />}>
    <TodayDateControl dayName="Sexta-feira" numericDate="04/09/2026" isTodaySelected={false} nextDisabled={false}
      previousLabel="Anterior" goToTodayLabel="Hoje" nextLabel="Próximo" moreLabel="Opções" searchLabel="Buscar"
      selectLabel="Selecionar" collapseLabel="Recolher" refreshLabel="Atualizar" completedLabel="Concluídos" allCollapsed={false} showCompleted isFetching={false}
      onGoToPreviousDay={vi.fn()} onGoToToday={vi.fn()} onGoToNextDay={vi.fn()} onSearch={vi.fn()}
      onToggleSelect={vi.fn()} onToggleCollapse={vi.fn()} onRefresh={vi.fn()} onToggleCompleted={vi.fn()} />
  </Shell412>) as GeometryTree })
  try {
    const scrollerHost = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'shell-scroller')[0]!
    const pageMinimum = StyleSheet.flatten(scrollerHost.props.style as StyleProp<ViewStyle>).minHeight as number
    expect.soft(pageMinimum - SHELL_SCROLLER_CLEARANCE, 'declared page minimum retains usable space beyond focus clearance').toBeGreaterThanOrEqual(SPACING.s96)
    const shell = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'shell-412')[0]!
    const reportLayout = shell.props.onLayout as (event: Pick<LayoutChangeEvent, 'nativeEvent'>) => void
    await act(() => reportLayout({ nativeEvent: { layout: { x: 0, y: 0, ...viewport } } }))
    const flow = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'shell-flow-viewport')[0]!
    const destinationMinimum = StyleSheet.flatten(flow.props.contentContainerStyle as StyleProp<ViewStyle>).minHeight
    expect.soft(destinationMinimum, 'outer destination budgets the same physical page minimum').toBe(pageMinimum + SPACING.s64 + TOUCH_TARGET_MIN + TAB_BAR_MIN_HEIGHT)
    const boxes = measureSafeArea(tree.toJSON(), host => host.props.accessibilityLabel ?? host.props.testID, viewport)
    const scroller = boxes.get('shell-scroller')!
    expect(scroller.bottom - scroller.top).toBeGreaterThanOrEqual(SPACING.s96)
    expect.soft(scroller.bottom - scroller.top - SHELL_SCROLLER_CLEARANCE, 'measured page retains usable space beyond focus clearance').toBeGreaterThanOrEqual(SPACING.s96)
    const date = boxes.get('Sexta-feira, 04/09/2026, Hoje')!
    expect(scroller.bottom - scroller.top).toBeGreaterThanOrEqual(date.bottom - date.top + SPACING.s8)
    const background = boxes.get('shell-background')!
    expect(Number.isInteger(background.left)).toBe(true)
    const fab = boxes.get('Criar')!
    expect(fab.top).toBeGreaterThanOrEqual(scroller.top)
    expect(fab.bottom).toBeLessThanOrEqual(scroller.bottom - 16)
  } finally { await act(() => tree.unmount()) }
})

it.each([{ width: 840, height: 240 }, { width: 360, height: 320 }, { width: 740, height: 360 }, { width: 844, height: 390 }].flatMap(viewport =>
  [{ top: 0, bottom: 0 }, { top: 24, bottom: 16 }].map(insets => ({ ...viewport, ...insets })),
).concat([{ width: 844, height: 390, top: 0, bottom: 21 }]).flatMap(viewport => [false, true].map(pressure => ({ ...viewport, pressure }))))(
  'keeps the real composer and bottom controls reachable at $width by $height with insets $top/$bottom, pressure=$pressure', async (viewport) => {
    safeArea.top = viewport.top
    safeArea.bottom = viewport.bottom
    __setWindowDimensions({ ...viewport, scale: 1, fontScale: viewport.pressure ? 2 : 1 })
    const inputLabel = ptBR.shell.composer.inputLabel
    const scrollTo = vi.fn()
    __setScrollToImpl(scrollTo)
    const items = ['hoje', 'calendario', 'progresso', 'perfil'].map(id => ({ id, label: id, icon: () => <View style={{ width: 24, height: 24 }} /> }))
    let tree!: GeometryTree
    await act(() => { tree = create(<Shell412
      header={<DestinationHeaderRow testID="header-control"><View style={{ height: 48 }} /></DestinationHeaderRow>}
      notice={viewport.pressure ? <View style={{ minHeight: 160 }}><Toast kind="neutral" message="Saved" persistent /></View> : undefined}
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
      const measuredHeader = measureSafeArea(tree.toJSON(), host => host.props.testID, viewport).get('shell-header')!
      const headerHost = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'shell-header')[0]!
      const reportHeaderLayout = headerHost.props.onLayout as (event: Pick<LayoutChangeEvent, 'nativeEvent'>) => void
      await act(() => reportHeaderLayout({ nativeEvent: { layout: { x: 0, y: 0, width: measuredHeader.width, height: measuredHeader.bottom - measuredHeader.top } } }))
      const boxes = measureSafeArea(tree.toJSON(), host => host.type === 'TextInput' && host.props.accessibilityLabel === inputLabel ? 'real-composer-input' : host.props.testID, viewport)
      const inputBounds = boxes.get('real-composer-input')!
      expect(inputBounds.bottom - inputBounds.top, 'actual input retains its full line height').toBeGreaterThanOrEqual(24 * (viewport.pressure ? 2 : 1) + 24)
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
      expect(StyleSheet.flatten(host.props.style as StyleProp<ViewStyle>).minHeight, 'declared bottom budget grows with the actual input').toBe(viewport.pressure ? 80 : 64)
      const reportLayout = host.props.onLayout as (event: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => void
      const reportContent = host.props.onContentSizeChange as (width: number, height: number) => void
      await act(() => {
        reportLayout({ nativeEvent: { layout: { x: bottomViewport.left, y: bottomViewport.top, width: bottomViewport.width, height: bottomViewport.bottom - bottomViewport.top } } })
        reportContent(bottomViewport.width, composer.bottom - bottomViewport.top)
      })
      const offset = scrollTo.mock.lastCall![0].y as number
      expect(boxes.get('composer-field')!.top - offset).toBeGreaterThanOrEqual(bottomViewport.top)
      expect(boxes.get('composer-field')!.bottom - offset).toBeLessThanOrEqual(bottomViewport.bottom)
      for (const key of ['composer-field', 'composer-send-accent', 'composer-controls', 'real-composer-input']) {
        const control = boxes.get(key)!
        const offset = Math.min(maximumScroll, Math.max(0, control.bottom - bottomViewport.bottom))
        expect(control.top - offset, key).toBeGreaterThanOrEqual(bottomViewport.top)
        expect(control.bottom - offset, key).toBeLessThanOrEqual(bottomViewport.bottom)
      }
      const fab = boxes.get('fab')!
      expect(fab.top).toBeGreaterThanOrEqual(boxes.get('control-region')!.top)
      expect(fab.bottom).toBeLessThanOrEqual(boxes.get('control-region')!.bottom - 16)
      expect(fab.top).toBeGreaterThanOrEqual(boxes.get('header-control')!.bottom)
      expect(fab.bottom).toBeLessThanOrEqual(pinned.top)
      expect(bottomViewport.top).toBeGreaterThanOrEqual(boxes.get('control-region')!.bottom)
      const flow = boxes.get('shell-flow-viewport')!
      const background = boxes.get('shell-background')!
      expect(boxes.get('bottom-tab-destinations')!.bottom).toBeLessThanOrEqual(background.bottom)
      const outerScroll = Math.max(0, background.bottom - flow.bottom)
      const outerHost = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'shell-flow-viewport')[0]!
      expect(outerHost.props.scrollEnabled).toBe(true)
      expect.soft(outerHost.props.onLayout, 'native recovery measures the actual viewport').toBeTypeOf('function')
      expect(outerHost.props.onContentSizeChange, 'native recovery measures the actual content').toBeTypeOf('function')
      const reportOuterLayout = outerHost.props.onLayout as (event: Pick<LayoutChangeEvent, 'nativeEvent'>) => void
      const reportOuterContent = outerHost.props.onContentSizeChange as (width: number, height: number) => void
      scrollTo.mockClear()
      await act(() => {
        reportOuterLayout({ nativeEvent: { layout: { x: flow.left, y: flow.top, width: flow.width, height: flow.bottom - flow.top } } })
        reportOuterContent(background.width, background.bottom - background.top)
      })
      expect(scrollTo).toHaveBeenLastCalledWith({ y: outerScroll, animated: false })
      expect(boxes.get('bottom-tab-destinations')!.bottom - scrollTo.mock.lastCall![0].y).toBeLessThanOrEqual(viewport.height - viewport.bottom)
      const reportOuterScroll = outerHost.props.onScroll as (event: { nativeEvent: { contentOffset: { y: number } } }) => void
      await act(() => reportOuterScroll({ nativeEvent: { contentOffset: { y: 0 } } }))
      scrollTo.mockClear()
      await act(() => reportOuterContent(background.width, background.bottom - background.top + 32))
      expect(scrollTo, 'resizing preserves a header the person has revealed').not.toHaveBeenCalled()
      await act(() => reportOuterScroll({ nativeEvent: { contentOffset: { y: outerScroll + 32 } } }))
      await act(() => reportOuterContent(background.width, background.bottom - background.top + 64))
      expect(scrollTo, 'resizing follows trailing controls while already at the end').toHaveBeenLastCalledWith({ y: outerScroll + 64, animated: false })
      const input = tree.root.findAll(node => String(node.type) === 'TextInput' && node.props.accessibilityLabel === inputLabel)[0]!
      scrollTo.mockClear()
      await act(() => reportShellLayout({ nativeEvent: { layout: { x: 0, y: 0, width: viewport.width, height: 915 } } }))
      expect(scrollTo, 'leaving constrained recovery restores the normal origin').toHaveBeenLastCalledWith({ y: 0, animated: false })
      expect(tree.root.findAll(node => String(node.type) === 'TextInput' && node.props.accessibilityLabel === inputLabel)[0]).toBe(input)
    } finally { await act(() => tree.unmount()) }
  },
)
