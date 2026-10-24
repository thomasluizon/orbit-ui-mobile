import { resolveParentChoicePreview, makeParentChoicePreview, makeBulkCreateExecutionResponse, makeCreateHabitsPreview, makeMixedHabitsPreview, makeDeleteHabitsPreview } from '@orbit/shared/test-support/pending-operation-preview-fixtures'
import { IntlMessageFormat } from 'intl-messageformat'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import React from 'react'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native'
import type { PendingAgentOperation } from '@orbit/shared/types/ai'
import type { PendingOperationRevisionResponse, RefreshPendingOperation, RevisePendingOperation } from '@orbit/shared/hooks'
import { makeHeldHabitMessage, makePendingAgentOperation, pendingWriteSummaryCases, makePendingWriteSummaryOperation, partialScheduleSummaryCases, makePartialScheduleSummaryOperation } from '@orbit/shared/test-support/chat-fixtures'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'
import { renderedText } from '../../support/react-test-renderer'
import { createTokensV2 } from '@/lib/theme'
import { sheetTestControls } from '../../support/sheet-double'
import { focusHost, withFocusProvenance } from '../../support/focus-provenance'
import { __resetTestHostConfig, __setFocusImpl, __setTouchMode, __focusHost, __getFocusedNativeTag } from '../../../test-mocks/react-native'

const TestRenderer = require('react-test-renderer')

vi.mock('react-native', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-native')>(),
  I18nManager: { isRTL: false },
}))

const visibleLocale = vi.hoisted(() => ({ language: 'en', actual: false }))

function translateVisible(key: string, values?: Record<string, string | number>): string {
  const messages = visibleLocale.language === 'en' ? en : ptBR
  const message = key.split('.').reduce<unknown>((current, segment) => typeof current === 'object' && current !== null ? (current as Record<string, unknown>)[segment] : undefined, messages)
  return typeof message === 'string' ? new IntlMessageFormat(message, visibleLocale.language).format(values) as string : key
}

vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: visibleLocale.language }, t: (key: string, values?: Record<string, string | number>) => {
  if (visibleLocale.actual) return translateVisible(key, values)
  if (key === 'chat.preview.diff') return `${values?.field}: from ${values?.old} to ${values?.new}`
  if (key === 'chat.preview.more') return `and ${values?.count} more`
  if (key === 'chat.action.openEntity') return `Open details: ${values?.name}`
  return key
} }) }))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/components/ui/confirm-sheet', () => ({
  ConfirmSheet: (props: { open: boolean; onConfirm: () => void; title: string; confirmLabel: string; destructive: boolean }) =>
    props.open ? React.createElement('ConfirmSheet', props) : null,
}))
vi.mock('@/components/ui/sheet', async () => await import('../../support/sheet-double'))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: false } }) }))
vi.mock('@/components/ui/otp-input', () => ({
  OtpInput: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) =>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} />,
}))

function renderCard(overrides: Partial<PendingAgentOperation> = {}, onRevise?: RevisePendingOperation, onRefresh?: RefreshPendingOperation, onOpenTarget?: (entityId: string, actionType: string) => void, focusProvenance = false) {
  const handlers = {
    onConfirmExecute: vi.fn(),
    onPrepareStepUp: vi.fn(),
    onVerifyStepUp: vi.fn(),
  }
  let tree: any
  TestRenderer.act(() => {
    const card = <PendingOperationCard pendingOperation={makePendingAgentOperation(overrides)} onRevise={onRevise} onRefresh={onRefresh} onOpenTarget={onOpenTarget} {...handlers} />
    tree = TestRenderer.create(focusProvenance ? withFocusProvenance(card) : card)
  })
  return { tree, handlers }
}

function press(tree: any, label: string) {
  return tree.root.findAll((node: any) =>
    typeof node.props?.onPress === 'function' && renderedText(node.props.children).includes(label),
  )[0]
}

beforeEach(() => { vi.clearAllMocks(); __resetTestHostConfig(); visibleLocale.actual = false; visibleLocale.language = 'en' })
afterEach(() => sheetTestControls.defer(false))

describe('PendingOperationCard (mobile)', () => {
  it.each([0, null, undefined].flatMap(count => ['en', 'pt-BR'].map(locale => ({ count, locale }))))('renders a zero-target preview as a notice without approval with count $count in $locale', ({ count, locale }) => {
    visibleLocale.actual = true
    visibleLocale.language = locale
    const { tree, handlers } = renderCard({ ...makeCreateHabitsPreview(0), changeTargetCount: count })
    expect(tree.root.findAllByType(Pressable)).toHaveLength(0)
    expect(renderedText(tree.toJSON())).toContain((locale === 'en' ? en : ptBR).chat.operation.empty)
    expect(renderedText(tree.toJSON())).not.toContain('chat.pendingOp.pendingTitle')
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
  })

  it.each(['done', 'failed'] as const)('keeps an empty operation settled as %s with its recovery', async status => {
    const operation = { ...makeCreateHabitsPreview(0), changeTargetCount: null, changes: [] }
    const handlers = { onConfirmExecute: vi.fn(), onPrepareStepUp: vi.fn(), onVerifyStepUp: vi.fn() }
    let tree!: ReactTestRenderer
    TestRenderer.act(() => { tree = TestRenderer.create(<PendingOperationCard pendingOperation={operation} savedState={{ status, canRetry: status === 'failed' }} {...handlers} />) })
    expect(renderedText(tree.root)).not.toContain('chat.operation.empty')
    if (status === 'done') {
      expect(renderedText(tree.root)).toContain('blockFrame.status.done')
      expect(press(tree, 'common.retry')).toBeUndefined()
    } else {
      expect(renderedText(tree.root)).toContain('chat.operationFailed')
      handlers.onConfirmExecute.mockReturnValue(new Promise(() => {}))
      await TestRenderer.act(() => { press(tree, 'common.retry').props.onPress() })
      expect(handlers.onConfirmExecute).toHaveBeenCalledWith(operation.id)
    }
  })

  it.each([null, undefined])('keeps plain confirmation when the producer has no item preview: %s', items => {
    const { tree } = renderCard({ ...makeCreateHabitsPreview(1), items, changes: null, changeTargetCount: null })
    expect(press(tree, 'chat.operation.approveCount')).toBeDefined()
  })

  it('disables every preview action and announces busy during deletion', () => {
    const { tree, handlers } = renderCard(makeDeleteHabitsPreview(10), vi.fn())
    handlers.onConfirmExecute.mockReturnValue(new Promise(() => {}))
    TestRenderer.act(() => press(tree, 'chat.operation.approveCount.deleteHabits').props.onPress())
    TestRenderer.act(() => tree.root.findByType('ConfirmSheet').props.onConfirm())
    expect(tree.root.findAllByType(Text).filter((node: ReactTestInstance) => node.props.children === 'blockFrame.status.acting')).toHaveLength(10)
    const actions = tree.root.findAllByType(Pressable).filter((node: ReactTestInstance) => (typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('chat.operation.remove')) || renderedText(node.props.children).includes('chat.operation.reject') || renderedText(node.props.children).includes('chat.operation.approveCount'))
    for (const action of actions) expect(action.props.disabled).toBe(true)
    expect(tree.root.findByProps({ testID: 'block-frame-body' }).props.accessibilityState).toEqual({ busy: true })
    expect(tree.root.findByProps({ testID: 'block-frame-body' }).props.accessibilityLiveRegion).toBe('polite')
    expect(handlers.onConfirmExecute).toHaveBeenCalledOnce()
  })

  it('clears a failed removal on stale approval before reporting an actual refresh failure', async () => {
    const refresh = vi.fn().mockResolvedValue({ ok: false, error: 'network_error' })
    const revise = vi.fn().mockResolvedValue({ ok: false, error: 'network_error' })
    const { tree, handlers } = renderCard(preview, revise, refresh)
    handlers.onConfirmExecute.mockResolvedValue({ ok: false, stale: true, error: 'stale_preview' })
    await TestRenderer.act(async () => { tree.root.findByProps({ accessibilityLabel: 'chat.operation.remove Run' }).props.onPress(); await Promise.resolve() })
    expect(renderedText(tree.toJSON())).toContain('chat.operation.invalid')
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
    await TestRenderer.act(async () => { press(tree, 'chat.operation.approve').props.onPress(); await Promise.resolve() })
    expect(refresh).not.toHaveBeenCalled()
    expect(tree.root.findAllByType(Text).filter((node: ReactTestInstance) => node.props.children === 'chat.operation.stale')).toHaveLength(1)
    expect(renderedText(tree.toJSON())).not.toContain('chat.operation.refreshFailed')
    await TestRenderer.act(async () => { tree.root.findByProps({ accessibilityLabel: 'chat.operation.refresh' }).props.onPress(); await Promise.resolve() })
    expect(renderedText(tree.toJSON())).not.toContain('chat.operation.stale')
    expect(renderedText(tree.toJSON())).not.toContain('chat.operationFailed')
    expect(tree.root.findAllByType(Text).filter((node: ReactTestInstance) => node.props.children === 'chat.operation.refreshFailed')).toHaveLength(1)
  })

  describe.each(['en', 'pt-BR'])('batch recovery in %s', (locale) => {
    it('retries the same batch after a producer pre-write failure without failing unrun rows', async () => {
      visibleLocale.actual = true
      visibleLocale.language = locale
      const operation = makeCreateHabitsPreview(2)
      const messages = locale === 'en' ? en : ptBR
      const { tree, handlers } = renderCard(operation)
      handlers.onConfirmExecute.mockResolvedValueOnce({ ok: true, response: makeBulkCreateExecutionResponse() })
        .mockResolvedValueOnce({ ok: true, response: makeBulkCreateExecutionResponse(['Success', 'Success']) })
      await TestRenderer.act(async () => { press(tree, locale === 'en' ? 'Create 2 habits' : 'Criar 2 hábitos').props.onPress(); await Promise.resolve() })
      expect(press(tree, messages.common.retry)).toBeDefined()
      expect(renderedText(tree.toJSON())).not.toContain(messages.blockFrame.status.failed)
      expect(renderedText(tree.toJSON())).toContain(messages.chat.operationFailed)
      await TestRenderer.act(async () => { press(tree, messages.common.retry).props.onPress(); await Promise.resolve() })
      expect(tree.root.findByProps({ testID: 'block-frame-item-0-done' })).toBeDefined()
      expect(tree.root.findByProps({ testID: 'block-frame-item-1-done' })).toBeDefined()
      expect(handlers.onConfirmExecute.mock.calls).toEqual([[operation.id], [operation.id]])
      expect(press(tree, messages.common.retry)).toBeUndefined()
    })

    it.each([['Success', 'Failed'], ['Failed', 'Failed']] as const)('shows producer item outcomes %s and %s without retrying a consumed batch', async (first, second) => {
      visibleLocale.actual = true
      visibleLocale.language = locale
      const operation = makeCreateHabitsPreview(2)
      const messages = locale === 'en' ? en : ptBR
      const onOpenTarget = vi.fn()
      const { tree, handlers } = renderCard(operation, undefined, undefined, onOpenTarget)
      handlers.onConfirmExecute.mockResolvedValue({ ok: true, response: makeBulkCreateExecutionResponse([first, second]) })
      await TestRenderer.act(async () => { press(tree, locale === 'en' ? 'Create 2 habits' : 'Criar 2 hábitos').props.onPress(); await Promise.resolve() })
      expect(tree.root.findByProps({ testID: 'block-frame-item-0-' + (first === 'Success' ? 'done' : 'failed') })).toBeDefined()
      expect(tree.root.findByProps({ testID: 'block-frame-item-1-failed' })).toBeDefined()
      expect(press(tree, messages.common.retry)).toBeUndefined()
      expect(renderedText(tree.toJSON())).not.toContain(messages.chat.operationFailed)
      expect(renderedText(tree.toJSON())).toContain(messages.chat.operation.batchFailed)
      if (first === 'Success') {
        TestRenderer.act(() => press(tree, messages.chat.action.open).props.onPress())
        expect(onOpenTarget).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000020', 'CreateHabit')
      }
    })
  })

  describe.each(['en', 'pt-BR'])('operation approval in %s', (locale) => {
    it.each(['Low', 'Destructive', 'High'] as const)('approves creation directly with %s internal risk', async (riskClass) => {
      visibleLocale.actual = true
      visibleLocale.language = locale
      const operation = { ...makeCreateHabitsPreview(), riskClass }
      const { tree, handlers } = renderCard(operation)
      handlers.onConfirmExecute.mockResolvedValue({ ok: true, response: { operation: { status: 'Succeeded' } } })
      const messages = locale === 'en' ? en : ptBR
      expect(renderedText(tree.toJSON())).not.toContain(messages.chat.operation.irreversible)
      expect(renderedText(tree.toJSON())).not.toContain(messages.chat.operation.confirmNote)
      await TestRenderer.act(async () => { press(tree, locale === 'en' ? 'Create 12 habits' : 'Criar 12 hábitos').props.onPress(); await Promise.resolve() })
      expect(handlers.onConfirmExecute).toHaveBeenCalledWith(operation.id)
      expect(tree.root.findAllByType('ConfirmSheet')).toHaveLength(0)
    })

    it('updates the action count after removing a proposed habit', async () => {
      visibleLocale.actual = true
      visibleLocale.language = locale
      const operation = makeCreateHabitsPreview()
      const items = operation.items!.slice(1)
      const revise = vi.fn().mockResolvedValue({ ok: true, result: { isSuccess: true, error: null, pendingOperationId: operation.id,
        cancelled: false, preview: { changes: [], items, changeTargetCount: 11, previewFingerprint: 'revised-create' } } })
      const { tree } = renderCard(operation, revise)
      await TestRenderer.act(async () => { tree.root.findByProps({ accessibilityLabel: `${locale === 'en' ? 'Remove' : 'Remover'} Habit 1` }).props.onPress(); await Promise.resolve() })
      expect(press(tree, locale === 'en' ? 'Create 11 habits' : 'Criar 11 hábitos')).toBeDefined()
      expect(press(tree, locale === 'en' ? 'Create 12 habits' : 'Criar 12 hábitos')).toBeUndefined()
    })

    it('approves the remaining creation directly after removing the last deletion', async () => {
      visibleLocale.actual = true
      visibleLocale.language = locale
      const mixed = makeMixedHabitsPreview()
      const items = mixed.items!.slice(0, 2)
      const operation = { ...mixed, items: mixed.items!.slice(0, 3), changeTargetCount: 3 }
      const revise = vi.fn().mockResolvedValue({ ok: true, result: { isSuccess: true, error: null, pendingOperationId: operation.id,
        cancelled: false, preview: { changes: [], items, changeTargetCount: 2, previewFingerprint: 'revised-mixed' } } })
      const { tree, handlers } = renderCard(operation, revise)
      handlers.onConfirmExecute.mockResolvedValue({ ok: true, response: { operation: { status: 'Succeeded' } } })
      await TestRenderer.act(async () => { tree.root.findByProps({ accessibilityLabel: `${locale === 'en' ? 'Remove' : 'Remover'} Old habit 1` }).props.onPress(); await Promise.resolve() })
      await TestRenderer.act(async () => { press(tree, locale === 'en' ? 'Create 2 habits' : 'Criar 2 hábitos').props.onPress(); await Promise.resolve() })
      expect(handlers.onConfirmExecute).toHaveBeenCalledWith(operation.id)
      const messages = locale === 'en' ? en : ptBR
      expect(renderedText(tree.toJSON())).not.toContain(messages.chat.operation.irreversible)
      expect(renderedText(tree.toJSON())).not.toContain(messages.chat.operation.confirmNote)
      expect(tree.root.findAllByType('ConfirmSheet')).toHaveLength(0)
    })

    it('marks only delete rows and confirms their count', () => {
      visibleLocale.actual = true
      visibleLocale.language = locale
      const operation = makeMixedHabitsPreview()
      const { tree, handlers } = renderCard(operation)
      const messages = locale === 'en' ? en : ptBR
      expect(tree.root.findAllByType(Text).filter((node: ReactTestInstance) => node.props.children === messages.chat.operation.irreversible)).toHaveLength(3)
      for (const item of operation.items!) {
        const row = tree.root.findByProps({ testID: `block-frame-item-${item.itemId}-pending-proposed` })
        expect(row.findAllByType(Text).some((node: ReactTestInstance) => node.props.children === messages.chat.operation.irreversible)).toBe(item.removesData === true)
      }
      expect(renderedText(tree.toJSON())).toContain(messages.chat.operation.confirmNote)
      TestRenderer.act(() => press(tree, messages.chat.pendingOp.action.applyChanges).props.onPress())
      expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
      expect(tree.root.findByType('ConfirmSheet').props).toMatchObject({
        title: locale === 'en' ? 'Delete habits?' : 'Apagar hábitos?',
        message: locale === 'en' ? '3 habits and everything inside them leave your list. There is no way to restore this here.' : '3 hábitos e tudo o que há neles serão removidos da sua lista. Não há como restaurar por aqui.',
        confirmLabel: locale === 'en' ? 'Delete habits' : 'Apagar hábitos', destructive: true,
      })
    })
  })


  describe.each(['en', 'pt-BR'])('visible write summaries in %s', (locale) => {
    it.each(pendingWriteSummaryCases)('shows $name', (scenario) => {
      visibleLocale.actual = true
      visibleLocale.language = locale
      const operation = makePendingWriteSummaryOperation(scenario)
      const expected = locale === 'en' ? scenario.english : scenario.portuguese
      const { tree } = renderCard(operation)
      expect(tree.root.findAllByType(Text).filter((node: { props: { children?: unknown; importantForAccessibility?: string } }) => node.props.children === expected)).toHaveLength(1)
      expect(renderedText(tree.toJSON())).not.toContain(operation.items![0]!.entityId!)
    })

    it.each(partialScheduleSummaryCases)('shows only the changed schedule fields: $name', (scenario) => {
      visibleLocale.actual = true
      visibleLocale.language = locale
      const operation = makePartialScheduleSummaryOperation(scenario)
      const expected = locale === 'en' ? scenario.english : scenario.portuguese
      const { tree } = renderCard(operation)
      expect(tree.root.findAllByType(Text).filter((node: { props: { children?: unknown; importantForAccessibility?: string } }) => node.props.children === expected)).toHaveLength(1)
    })
  })

  it('renders one named habit with a cadence instead of field diffs', () => {
    const operation = makeHeldHabitMessage().pendingOperations![0]!
    const item = operation.items![0]!
    const fields = [
      ...item.fields,
      { ...item.fields[0]!, field: 'frequency_unit', newValue: 'Day' },
      { ...item.fields[0]!, field: 'frequency_quantity', newValue: '1', valueType: 'number' },
      { ...item.fields[0]!, field: 'emoji', newValue: '📚' },
    ]
    const { tree } = renderCard({ ...operation, changes: fields, items: [{ ...item, fields }] }, vi.fn())
    const text = renderedText(tree.toJSON())
    expect(text).toContain('habits.frequency.everyDay')
    expect(text).not.toContain('chat.operation.field')
    expect(text).not.toContain('from ')
    expect(tree.root.findAllByType(Text).filter((node: { props: { children?: unknown; importantForAccessibility?: string } }) => node.props.children === 'Beber água' && node.props.importantForAccessibility !== 'no-hide-descendants')).toHaveLength(1)
  })

  const firstItem = {
    itemId: 'habit-1', entityId: 'habit-1', entityName: 'Run', stateFingerprint: 'state-1',
    fields: [{ entityId: 'habit-1', entityName: 'Run', field: 'date', oldValue: null, newValue: '2026-09-26', valueType: 'date' }],
  }
  const secondItem = {
    itemId: 'habit-2', entityId: 'habit-2', entityName: 'Read', stateFingerprint: 'state-2',
    fields: [{ entityId: 'habit-2', entityName: 'Read', field: 'date', oldValue: null, newValue: '2026-09-26', valueType: 'date' }],
  }
  const preview = { riskClass: 'Low' as const, confirmationRequirement: 'None' as const,
    previewFingerprint: 'preview-1', items: [firstItem, secondItem], changeTargetCount: 2 }

  it('removes one item before approving the rest', async () => {
    const revise = vi.fn().mockResolvedValue({ ok: true, result: {
      isSuccess: true, error: null, pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 1, items: [secondItem], previewFingerprint: 'preview-2' },
    } })
    const { tree, handlers } = renderCard(preview, revise)
    handlers.onConfirmExecute.mockResolvedValue({ ok: true, response: { operation: { status: 'Succeeded' } } })
    await TestRenderer.act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'chat.operation.remove Run' }).props.onPress()
      await Promise.resolve()
    })
    expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1', items: [{ itemId: 'habit-2' }],
    })
    expect(renderedText(tree.toJSON())).not.toContain('Run')
    await TestRenderer.act(async () => {
      press(tree, 'chat.operation.approve').props.onPress()
      await Promise.resolve()
    })
    expect(handlers.onConfirmExecute).toHaveBeenCalledOnce()
  })

  it.each(['immediate', 'deferred'])('edits one field without executing with %s revision', async (timing) => {
    const editedItem = { ...firstItem, fields: [{ ...firstItem.fields[0]!, newValue: '2026-09-27' }] }
    const revision: PendingOperationRevisionResponse = { ok: true, result: {
      isSuccess: true, error: null, pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 2, items: [editedItem, secondItem], previewFingerprint: 'preview-2' },
    } }
    let resolveRevision!: (result: PendingOperationRevisionResponse) => void
    const revise = vi.fn<RevisePendingOperation>().mockReturnValue(timing === 'immediate' ? Promise.resolve(revision)
      : new Promise<PendingOperationRevisionResponse>((resolve) => { resolveRevision = resolve }))
    const { tree, handlers } = renderCard(preview, revise)
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'chat.operation.field.date' }).props.onChangeText('2026-09-27'))
    await TestRenderer.act(async () => {
      press(tree, 'common.save').props.onPress()
      await Promise.resolve()
    })
    expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1',
      items: [{ itemId: 'habit-1', edits: { date: '2026-09-27' } }, { itemId: 'habit-2' }],
    })
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
    if (timing === 'deferred') {
      expect(renderedText(tree.toJSON())).not.toContain('chat.operation.edited')
      expect(press(tree, 'common.save').props.disabled).toBe(true)
      await TestRenderer.act(async () => { resolveRevision(revision); await Promise.resolve() })
    }
    expect(renderedText(tree.toJSON())).toContain('chat.operation.edited')
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
  })

  it('rejects every item and collapses the preview', async () => {
    const revise = vi.fn().mockResolvedValue({ ok: true, result: {
      isSuccess: true, error: null, pendingOperationId: null, preview: null, cancelled: true,
    } })
    const { tree, handlers } = renderCard(preview, revise)
    const announcement = tree.root.findByProps({ testID: 'preview-rejection-status' })
    expect(announcement.props.children).toBe('')
    await TestRenderer.act(async () => {
      press(tree, 'chat.operation.reject').props.onPress()
      await Promise.resolve()
    })
    expect(renderedText(tree.toJSON())).toContain('chat.operation.rejected')
    expect(tree.root.findByProps({ testID: 'preview-rejection-status' })).toBe(announcement)
    expect(announcement.props.accessibilityLiveRegion).toBe('polite')
    expect(renderedText(tree.toJSON())).not.toContain('chat.operation.approve')
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
  })

  it('removing the last item removes approval', async () => {
    const revise = vi.fn().mockResolvedValueOnce({ ok: true, result: {
      isSuccess: true, error: null, pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 1, items: [secondItem], previewFingerprint: 'preview-2' },
    } }).mockResolvedValueOnce({ ok: true, result: {
      isSuccess: true, error: null, pendingOperationId: null, preview: null, cancelled: true,
    } })
    const { tree, handlers } = renderCard(preview, revise)
    await TestRenderer.act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'chat.operation.remove Run' }).props.onPress()
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'chat.operation.remove Read' }).props.onPress()
      await Promise.resolve()
    })
    expect(revise).toHaveBeenLastCalledWith('pending-1', { previewFingerprint: 'preview-2', items: [] })
    expect(renderedText(tree.toJSON())).not.toContain('chat.operation.approve')
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
  })

  it('keeps inferred emoji changes as a plain confirmation', () => {
    const revise = vi.fn()
    const { tree } = renderCard({ displayName: 'bulk_update_habit_emojis', items: null, previewFingerprint: null }, revise)
    expect(tree.root.findAllByProps({ accessibilityLabel: 'chat.operation.edit' })).toHaveLength(0)
    expect(renderedText(tree.toJSON())).toContain('chat.operation.reject')
    expect(renderedText(tree.toJSON())).toContain('chat.operation.approve')
  })

  it('replaces a same-ID preview and clears an unsaved draft when its fingerprint changes', () => {
    const { tree, handlers } = renderCard(preview, vi.fn())
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'chat.operation.field.date' }).props.onChangeText('2026-09-30'))
    TestRenderer.act(() => tree.update(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...preview, items: [secondItem], changeTargetCount: 1, previewFingerprint: 'preview-other' })} onRevise={vi.fn()} {...handlers} />))
    expect(renderedText(tree.toJSON())).not.toContain('Run')
    expect(renderedText(tree.toJSON())).toContain('Read')
    expect(tree.root.findAllByProps({ accessibilityLabel: 'chat.operation.field.date' })).toHaveLength(0)
  })

  it('closes confirmation and blocks its old handler when the preview changes', async () => {
    const destructive = { ...preview, items: preview.items.map((item) => ({ ...item, removesData: true })), riskClass: 'Destructive' as const, confirmationRequirement: 'FreshConfirmation' as const }
    const { tree, handlers } = renderCard(destructive, vi.fn())
    TestRenderer.act(() => press(tree, 'chat.operation.approve').props.onPress())
    const oldConfirm = tree.root.findByType('ConfirmSheet').props.onConfirm

    TestRenderer.act(() => tree.update(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...destructive, previewFingerprint: 'preview-2', items: [secondItem] })} onRevise={vi.fn()} {...handlers} />))

    expect(tree.root.findAll((node: any) => node.type === 'ConfirmSheet')).toHaveLength(0)
    await TestRenderer.act(async () => { oldConfirm(); await Promise.resolve() })
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
  })

  it('keeps confirmation open when the preview fingerprint is unchanged', () => {
    const destructive = { ...preview, items: preview.items.map((item) => ({ ...item, removesData: true })), riskClass: 'Destructive' as const, confirmationRequirement: 'FreshConfirmation' as const }
    const { tree, handlers } = renderCard(destructive, vi.fn())
    TestRenderer.act(() => press(tree, 'chat.operation.approve').props.onPress())
    TestRenderer.act(() => tree.update(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...destructive, items: [...destructive.items] })} onRevise={vi.fn()} {...handlers} />))
    expect(tree.root.findAll((node: any) => node.type === 'ConfirmSheet')).toHaveLength(1)
  })

  it('discards prepared step up when the preview changes', async () => {
    const highRisk = { ...preview, riskClass: 'High' as const, confirmationRequirement: 'StepUp' as const }
    const { tree, handlers } = renderCard(highRisk, vi.fn())
    handlers.onPrepareStepUp.mockResolvedValue({ ok: true, challengeId: 'challenge-1', confirmationToken: 'confirmation-1' })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.stepUpAction').props.onPress(); await Promise.resolve() })
    expect(tree.root.findAllByType(TextInput).filter((node: any) => node.props.accessibilityLabel === 'stepUp.codeLabel')).toHaveLength(1)
    const oldVerify = tree.root.findAll((node: any) => node.props.prepared?.challengeId === 'challenge-1' && typeof node.props.onVerify === 'function')[0]?.props.onVerify

    TestRenderer.act(() => tree.update(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...highRisk, previewFingerprint: 'preview-2', items: [secondItem] })} onRevise={vi.fn()} {...handlers} />))

    expect(tree.root.findAllByType(TextInput).filter((node: any) => node.props.accessibilityLabel === 'stepUp.codeLabel')).toHaveLength(0)
    await oldVerify?.('pending-1', 'challenge-1', '123456', 'confirmation-1')
    expect(handlers.onVerifyStepUp).not.toHaveBeenCalled()
  })

  it('dismisses the native step-up sheet before removing it on preview replacement', async () => {
    sheetTestControls.defer(true)
    const highRisk = { ...preview, riskClass: 'High' as const, confirmationRequirement: 'StepUp' as const }
    const { tree, handlers } = renderCard(highRisk, vi.fn())
    handlers.onPrepareStepUp.mockResolvedValue({ ok: true, challengeId: 'challenge-1', confirmationToken: 'confirmation-1' })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.stepUpAction').props.onPress(); await Promise.resolve() })

    TestRenderer.act(() => tree.update(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...highRisk, previewFingerprint: 'preview-2', items: [secondItem] })} onRevise={vi.fn()} {...handlers} />))

    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(press(tree, 'common.cancel').props.disabled).toBe(true)
    expect(press(tree, 'stepUp.confirm').props.disabled).toBe(true)
    const dismiss = tree.root.find((node: any) => node.type === 'Pressable' && node.props.accessibilityLabel === 'attempt-dismiss')
    TestRenderer.act(() => dismiss.props.onPress())
    TestRenderer.act(() => sheetTestControls.completeDismissal())
    expect(tree.root.findAllByType(TextInput).filter((node: any) => node.props.accessibilityLabel === 'stepUp.codeLabel')).toHaveLength(0)
    expect(press(tree, 'chat.operation.stepUpAction').props.disabled).toBe(false)
    expect(handlers.onVerifyStepUp).not.toHaveBeenCalled()
  })

  it('removes the stale step-up sheet even when its native dismissal rejects', async () => {
    sheetTestControls.defer(true)
    const highRisk = { ...preview, riskClass: 'High' as const, confirmationRequirement: 'StepUp' as const }
    const { tree, handlers } = renderCard(highRisk, vi.fn())
    handlers.onPrepareStepUp.mockResolvedValue({ ok: true, challengeId: 'challenge-1', confirmationToken: 'confirmation-1' })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.stepUpAction').props.onPress(); await Promise.resolve() })

    TestRenderer.act(() => tree.update(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...highRisk, previewFingerprint: 'preview-2', items: [secondItem] })} onRevise={vi.fn()} {...handlers} />))
    TestRenderer.act(() => sheetTestControls.rejectDismissal())

    expect(tree.root.findAllByType(TextInput).filter((node: any) => node.props.accessibilityLabel === 'stepUp.codeLabel')).toHaveLength(0)
    expect(press(tree, 'chat.operation.stepUpAction').props.disabled).toBe(false)
  })

  it('removes a stale editor even when its native dismissal rejects', async () => {
    const revise = vi.fn().mockResolvedValue({ ok: false, error: 'stale', stale: true })
    const { tree } = renderCard(preview, revise)
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'chat.operation.field.date' }).props.onChangeText('2026-09-27'))
    sheetTestControls.defer(true)
    await TestRenderer.act(async () => {
      press(tree, 'common.save').props.onPress()
      await Promise.resolve()
    })
    TestRenderer.act(() => sheetTestControls.rejectDismissal())

    expect(tree.root.findAllByProps({ accessibilityLabel: 'chat.operation.field.date' })).toHaveLength(0)
  })

  it('keeps a pending verification response from replacing the stale native dismissal', async () => {
    sheetTestControls.defer(true)
    const highRisk = { ...preview, riskClass: 'High' as const, confirmationRequirement: 'StepUp' as const }
    const { tree, handlers } = renderCard(highRisk, vi.fn())
    handlers.onPrepareStepUp.mockResolvedValue({ ok: true, challengeId: 'challenge-1', confirmationToken: 'confirmation-1' })
    let resolveVerification!: (result: unknown) => void
    handlers.onVerifyStepUp.mockImplementation(() => new Promise((resolve) => { resolveVerification = resolve }))
    await TestRenderer.act(async () => { press(tree, 'chat.operation.stepUpAction').props.onPress(); await Promise.resolve() })
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'stepUp.codeLabel' }).props.onChangeText('123456'))
    TestRenderer.act(() => press(tree, 'stepUp.confirm').props.onPress())
    expect(handlers.onVerifyStepUp).toHaveBeenCalledOnce()

    TestRenderer.act(() => tree.update(<PendingOperationCard pendingOperation={makePendingAgentOperation({ ...highRisk, previewFingerprint: 'preview-2', items: [secondItem] })} onRevise={vi.fn()} {...handlers} />))
    await TestRenderer.act(async () => { resolveVerification({ ok: true, response: { operation: { status: 'Succeeded' } } }); await Promise.resolve() })
    expect(sheetTestControls.isDismissPending).toBe(true)
    TestRenderer.act(() => sheetTestControls.completeDismissal())
    expect(tree.root.findAllByType(TextInput).filter((node: any) => node.props.accessibilityLabel === 'stepUp.codeLabel')).toHaveLength(0)
    expect(press(tree, 'chat.operation.stepUpAction').props.disabled).toBe(false)
  })

  it('keeps a draft when the editor switches to another item and back', () => {
    const { tree } = renderCard(preview, vi.fn())
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'chat.operation.field.date' }).props.onChangeText('2026-09-30'))
    TestRenderer.act(() => tree.root.findByProps({ accessibilityRole: 'radio', accessibilityLabel: 'Read' }).props.onPress())
    TestRenderer.act(() => tree.root.findByProps({ accessibilityRole: 'radio', accessibilityLabel: 'Run' }).props.onPress())
    expect(tree.root.findByProps({ accessibilityLabel: 'chat.operation.field.date' }).props.value).toBe('2026-09-30')
    expect(tree.root.findAllByProps({ accessibilityLabel: 'common.search' })).toHaveLength(0)
  })

  function itemGroup(tree: ReactTestRenderer) {
    const groups = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'radiogroup' && node.props.accessibilityLabel === 'chat.operation.editTitle')
    expect(groups).toHaveLength(1)
    return groups[0]!
  }

  function itemRadios(group: ReactTestInstance) {
    return group.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio')
  }

  it.each(['en', 'pt-BR'])('names the editable item group in %s', (locale) => {
    visibleLocale.actual = true
    visibleLocale.language = locale
    const { tree } = renderCard(preview, vi.fn())
    TestRenderer.act(() => press(tree, translateVisible('chat.operation.edit')).props.onPress())
    const groups = tree.root.findAll((node: ReactTestInstance) => typeof node.type === 'string' && node.props.accessibilityRole === 'radiogroup')
    expect(groups).toHaveLength(1)
    expect(groups[0].props.accessibilityLabel).toBe(translateVisible('chat.operation.editTitle'))
  })

  it('groups editable items and preserves checked selection on hardware focus entry', () => {
    __setTouchMode(false)
    const focused = vi.fn()
    __setFocusImpl(focused)
    const revise = vi.fn()
    const { tree } = renderCard(preview, revise, undefined, undefined, true)
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    const group = itemGroup(tree)
    const [run, read] = itemRadios(group)
    expect(run!.props.accessibilityState).toMatchObject({ checked: true })
    TestRenderer.act(() => focusHost(tree, read!))
    expect(run!.props.accessibilityState).toMatchObject({ checked: true })
    expect(read!.props.accessibilityState).toMatchObject({ checked: false })
    expect(focused).toHaveBeenCalledWith(expect.objectContaining({ accessibilityRole: 'radio', accessibilityLabel: 'Run' }))
    TestRenderer.act(() => focusHost(tree, run!))
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'chat.operation.field.date' }).props.onChangeText('2026-09-30'))
    TestRenderer.act(() => focusHost(tree, read!))
    expect(read!.props.accessibilityState).toMatchObject({ checked: true })
    expect(run!.props.accessibilityState).toMatchObject({ checked: false })
    TestRenderer.act(run!.props.onPress)
    expect(tree.root.findByProps({ accessibilityLabel: 'chat.operation.field.date' }).props.value).toBe('2026-09-30')
    expect(revise).not.toHaveBeenCalled()
    TestRenderer.act(() => press(tree, 'common.cancel').props.onPress())
    expect(tree.root.findAllByProps({ accessibilityRole: 'radiogroup' })).toHaveLength(0)
  })

  it('retains selection and valid hardware focus after filtering editable items', () => {
    __setTouchMode(false)
    const items = Array.from({ length: 9 }, (_, index) => ({ ...firstItem, itemId: `habit-${index}`, entityName: `Habit ${index}` }))
    const { tree } = renderCard({ ...preview, items, changeTargetCount: items.length }, vi.fn(), undefined, undefined, true)
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    const group = itemGroup(tree)
    const search = tree.root.findByProps({ accessibilityLabel: 'common.search' })
    TestRenderer.act(() => search.props.onChangeText('Habit 8'))
    const [last] = itemRadios(group)
    expect(itemRadios(group)).toHaveLength(1)
    TestRenderer.act(() => focusHost(tree, search))
    TestRenderer.act(() => focusHost(tree, last!))
    expect(last!.props.accessibilityState).toMatchObject({ checked: false })
    TestRenderer.act(last!.props.onPress)
    expect(last!.props.accessibilityState).toMatchObject({ checked: true })
    TestRenderer.act(() => search.props.onChangeText(''))
    expect(itemRadios(group)).toHaveLength(9)
    const first = itemRadios(group)[0]!
    TestRenderer.act(() => focusHost(tree, last!))
    TestRenderer.act(() => focusHost(tree, first))
    expect(first.props.accessibilityState).toMatchObject({ checked: true })
    TestRenderer.act(() => search.props.onChangeText('missing'))
    expect(itemRadios(group)).toHaveLength(0)
    TestRenderer.act(() => search.props.onChangeText(''))
    expect(itemRadios(group)[0]!.props.accessibilityState).toMatchObject({ checked: true })
  })

  it('keeps grouped items disabled with reasons while saving', async () => {
    let finishRevision!: (result: { ok: false; error: string }) => void
    const revise = vi.fn<RevisePendingOperation>(() => new Promise((resolve) => { finishRevision = resolve }))
    const { tree } = renderCard(preview, revise, undefined, undefined, true)
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    TestRenderer.act(() => tree.root.findByProps({ accessibilityRole: 'radio', accessibilityLabel: 'Read' }).props.onPress())
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'chat.operation.field.date' }).props.onChangeText('2026-09-30'))
    TestRenderer.act(() => press(tree, 'common.save').props.onPress())
    expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1', items: [{ itemId: 'habit-1' }, { itemId: 'habit-2', edits: { date: '2026-09-30' } }],
    })
    const group = itemGroup(tree)
    const rows = itemRadios(group)
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.props.accessibilityState).toMatchObject({ disabled: true })
      expect(row.props.accessibilityLabel).toContain('blockFrame.status.acting')
      expect(row.props.focusable).toBe(true)
      expect(row.props.onPress).toBeUndefined()
      TestRenderer.act(() => focusHost(tree, row))
    }
    expect(rows[0]!.props.accessibilityState).toMatchObject({ checked: false })
    expect(rows[1]!.props.accessibilityState).toMatchObject({ checked: true })
    expect(press(tree, 'common.cancel').props.disabled).toBe(true)
    await TestRenderer.act(async () => { finishRevision({ ok: false, error: 'invalid_revision' }); await Promise.resolve() })
    expect(itemRadios(group)[1]!.props.accessibilityState).toMatchObject({ checked: true })
    expect(itemRadios(group)[1]!.props.onPress).toBeTypeOf('function')
    expect(tree.root.findByProps({ accessibilityLabel: 'chat.operation.field.date' }).props.value).toBe('2026-09-30')
  })

  it('shows one boolean editor label inside the switch and preserves its draft while saving', async () => {
    const booleanItem = { ...firstItem, fields: [{ ...firstItem.fields[0]!, field: 'reminder_enabled', valueType: 'boolean', newValue: 'true', proposedValue: true, isEditable: true }] }
    let finishRevision!: (result: PendingOperationRevisionResponse) => void
    const revise = vi.fn<RevisePendingOperation>(() => new Promise((resolve) => { finishRevision = resolve }))
    const { tree } = renderCard({ ...preview, items: [booleanItem], changeTargetCount: 1 }, revise)
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    const body = tree.root.findByProps({ testID: 'sheet-body-slot' }) as ReactTestInstance
    const label = 'chat.operation.field.reminder_enabled'
    expect(body.findAll((node: ReactTestInstance) => node.type === Text && node.props.children === label)).toHaveLength(1)
    const control = body.findAll((node: ReactTestInstance) => node.type === Pressable)[0]!
    expect(control.props.accessibilityRole).toBe('switch')
    expect(control.props.accessibilityLabel).toBe(label)
    expect(control.findAll((node: ReactTestInstance) => node.type === Text && node.props.children === label).length > 0).toBe(true)
    expect(control.props.accessibilityState).toMatchObject({ checked: true })
    TestRenderer.act(() => (control.props.onPress as () => void)())
    expect(control.props.accessibilityState).toMatchObject({ checked: false })
    TestRenderer.act(() => press(tree, 'common.save').props.onPress())
    expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1', items: [{ itemId: 'habit-1', edits: { reminder_enabled: false } }],
    })
    expect(control.props.disabled).toBe(true)
    await TestRenderer.act(async () => { finishRevision({ ok: false, error: 'invalid_revision' }); await Promise.resolve() })
    expect(control.props.disabled).toBe(false)
    expect(control.props.accessibilityState).toMatchObject({ checked: false })
  })

  it('uses theme foreground for every editor label and weekday chip', () => {
    const fields = [
      { ...firstItem.fields[0]!, field: 'reminder_enabled', valueType: 'boolean', newValue: 'true' },
      { ...firstItem.fields[0]!, field: 'days', valueType: 'text', newValue: 'Monday' },
    ]
    const { tree } = renderCard({ ...preview, items: [{ ...firstItem, fields }] }, vi.fn())
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    const body = tree.root.findByProps({ testID: 'sheet-body-slot' })
    const foreground = createTokensV2('purple', 'dark').fg1
    for (const label of ['chat.operation.field.reminder_enabled', 'chat.operation.field.days', 'dates.daysLong.monday']) {
      const text = body.findAllByType(Text).find((node: any) => node.props.children === label)
      expect(StyleSheet.flatten(text?.props.style)).toMatchObject({ color: foreground })
    }
    expect(body.findAllByType(ScrollView)).toHaveLength(0)
  })

  it('toggles weekday chips inside their pill press fill and saves the chosen days', async () => {
    const revise = vi.fn().mockResolvedValue({ ok: false, error: 'invalid_revision' })
    const fields = [{ ...firstItem.fields[0]!, field: 'days', valueType: 'text', newValue: 'Monday' }]
    const { tree } = renderCard({ ...preview, items: [{ ...firstItem, fields }] }, revise)
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    const tokens = createTokensV2('purple', 'dark')
    const chip = (label: string) => tree.root.findAllByType(Pressable).find((node: any) => renderedText(node.props.children) === label)
    const fill = (label: string, pressed: boolean) => StyleSheet.flatten(chip(label).props.style({ pressed }))

    expect(fill('dates.daysLong.monday', false)).toMatchObject({ borderRadius: 999, overflow: 'hidden', borderColor: tokens.primary, backgroundColor: tokens.selectionBg })
    expect(fill('dates.daysLong.tuesday', false)).toMatchObject({ borderRadius: 999, overflow: 'hidden', borderColor: tokens.hairlineStrong, backgroundColor: 'transparent' })
    expect(fill('dates.daysLong.monday', true).backgroundColor).toBe(tokens.bgHover)
    expect(fill('dates.daysLong.tuesday', true).backgroundColor).toBe(tokens.bgHover)

    TestRenderer.act(() => chip('dates.daysLong.tuesday').props.onPress())
    TestRenderer.act(() => chip('dates.daysLong.monday').props.onPress())
    expect(chip('dates.daysLong.tuesday').props.accessibilityState).toMatchObject({ selected: true })
    expect(chip('dates.daysLong.monday').props.accessibilityState).toMatchObject({ selected: false })
    await TestRenderer.act(async () => {
      press(tree, 'common.save').props.onPress()
      await Promise.resolve()
    })
    expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1', items: [{ itemId: 'habit-1', edits: { days: ['Tuesday'] } }],
    })
  })

  it('paints the remove control press fill inside its round hit area', () => {
    const { tree } = renderCard(preview, vi.fn())
    const remove = tree.root.findAllByType(Pressable).find((node: any) => node.props.accessibilityLabel === 'chat.operation.remove Run')
    const tokens = createTokensV2('purple', 'dark')

    expect(StyleSheet.flatten(remove.props.style({ pressed: true }))).toMatchObject({ width: 48, height: 48, borderRadius: 999, overflow: 'hidden', backgroundColor: tokens.bgHover })
    expect(StyleSheet.flatten(remove.props.style({ pressed: false })).backgroundColor).toBe('transparent')
  })

  it('shows editor search only when more than eight items are available', () => {
    const items = Array.from({ length: 9 }, (_, index) => ({ ...firstItem, itemId: `habit-${index}`, entityName: `Habit ${index}` }))
    const { tree } = renderCard({ ...preview, items, changeTargetCount: items.length }, vi.fn())
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    expect(tree.root.findAllByType(TextInput).filter((node: any) => node.props.accessibilityLabel === 'common.search')).toHaveLength(1)
  })
  it('edits a complete typed checklist even when its display text is shortened', async () => {
    const checklist = [{ text: 'Pack shoes', is_checked: false }, { text: 'Pack water', is_checked: true }]
    const listItem = { ...firstItem, fields: [{ ...firstItem.fields[0]!, field: 'checklist_items',
      newValue: 'Pack shoes and more', proposedValue: checklist, isEditable: true }] }
    const revise = vi.fn().mockResolvedValue({ ok: true, result: { isSuccess: true, error: null,
      pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 1, items: [listItem], previewFingerprint: 'preview-2' } } })
    const { tree } = renderCard({ ...preview, items: [listItem] }, revise)
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'chat.operation.field.checklist_items 1' }).props.onChangeText('Pack a jacket'))
    await TestRenderer.act(async () => { press(tree, 'common.save').props.onPress(); await Promise.resolve() })
    expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1', items: [{ itemId: 'habit-1', edits: { checklist_items: [
        { text: 'Pack a jacket', is_checked: false }, { text: 'Pack water', is_checked: true },
      ] } }],
    })
  })

  it('hides editing when the server marks a field non-editable', () => {
    const locked = { ...firstItem, fields: [{ ...firstItem.fields[0]!, isEditable: false, proposedValue: '2026-09-26' }] }
    const { tree } = renderCard({ ...preview, items: [locked] }, vi.fn())
    expect(tree.root.findAllByProps({ accessibilityLabel: 'chat.operation.edit' })).toHaveLength(0)
  })

  it('edits numeric reminder offsets without changing their type', async () => {
    const listItem = { ...firstItem, fields: [{ ...firstItem.fields[0]!, field: 'reminder_times',
      proposedValue: [15, 30], isEditable: true }] }
    const revise = vi.fn().mockResolvedValue({ ok: false, error: 'invalid_revision' })
    const { tree } = renderCard({ ...preview, items: [listItem] }, revise)
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    const offset = tree.root.findByProps({ accessibilityLabel: 'chat.operation.field.reminder_times 1' })
    expect(offset.props.value).toBe('15')
    TestRenderer.act(() => offset.props.onChangeText('20'))
    await TestRenderer.act(async () => { press(tree, 'common.save').props.onPress(); await Promise.resolve() })
    expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1', items: [{ itemId: 'habit-1', edits: { reminder_times: [20, 30] } }],
    })
    expect(renderedText(tree.toJSON())).toContain('chat.operation.invalid')
  })

  it('edits due time through a localized TimeField and submits the wire value', async () => {
    const listItem = { ...firstItem, fields: [{ ...firstItem.fields[0]!, field: 'due_time',
      valueType: 'time', newValue: '19:30', proposedValue: '19:30', isEditable: true }] }
    const revise = vi.fn().mockResolvedValue({ ok: false, error: 'invalid_revision' })
    const { tree } = renderCard({ ...preview, items: [listItem] }, revise)
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    const dueTime = tree.root.findByProps({ accessibilityLabel: 'chat.operation.field.due_time' })
    expect(dueTime.props.value).toBe('7:30 pm')
    TestRenderer.act(() => dueTime.props.onChangeText('8:15 PM'))
    await TestRenderer.act(async () => { press(tree, 'common.save').props.onPress(); await Promise.resolve() })
    expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1', items: [{ itemId: 'habit-1', edits: { due_time: '20:15' } }],
    })
  })

  it('edits scheduled reminder rows and submits the complete typed list', async () => {
    const scheduled = [{ when: 'same_day', time: '08:00' }]
    const listItem = { ...firstItem, fields: [{ ...firstItem.fields[0]!, field: 'scheduled_reminders',
      newValue: 'One reminder', proposedValue: scheduled, isEditable: true }] }
    const revise = vi.fn().mockResolvedValue({ ok: false, error: 'invalid_revision' })
    const { tree } = renderCard({ ...preview, items: [listItem] }, revise)
    TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
    TestRenderer.act(() => press(tree, 'chat.operation.list.dayBefore').props.onPress())
    TestRenderer.act(() => press(tree, 'chat.operation.list.sameDay').props.onPress())
    TestRenderer.act(() => press(tree, 'chat.operation.list.dayBefore').props.onPress())
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'chat.operation.field.scheduled_reminders 1: chat.operation.list.time' }).props.onChangeText('7:00 PM'))
    TestRenderer.act(() => press(tree, 'chat.operation.list.add').props.onPress())
    expect(tree.root.findAllByType(TextInput).filter((node: any) => node.props.accessibilityLabel === 'chat.operation.field.scheduled_reminders 2: chat.operation.list.time')).toHaveLength(1)
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'chat.operation.remove chat.operation.field.scheduled_reminders 2' }).props.onPress())
    expect(tree.root.findAllByType(TextInput).filter((node: any) => node.props.accessibilityLabel === 'chat.operation.field.scheduled_reminders 2: chat.operation.list.time')).toHaveLength(0)
    await TestRenderer.act(async () => { press(tree, 'common.save').props.onPress(); await Promise.resolve() })
    expect(revise).toHaveBeenCalledWith('pending-1', {
      previewFingerprint: 'preview-1', items: [{ itemId: 'habit-1', edits: {
        scheduled_reminders: [{ when: 'day_before', time: '19:00' }],
      } }],
    })
  })

  it('refreshes a stale preview and closes the old confirmation', async () => {
    const destructive = { ...preview, items: preview.items.map((item) => ({ ...item, removesData: true })), riskClass: 'Destructive' as const, confirmationRequirement: 'FreshConfirmation' as const }
    const revise = vi.fn().mockResolvedValue({ ok: false, error: 'stale_preview', stale: true })
    const refresh = vi.fn().mockResolvedValue({ ok: true, result: { isSuccess: true, error: null,
      pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 1, items: [secondItem], previewFingerprint: 'preview-2' } } })
    const { tree, handlers } = renderCard(destructive, revise, refresh)
    TestRenderer.act(() => press(tree, 'chat.operation.approve').props.onPress())
    const oldConfirm = tree.root.findByType('ConfirmSheet').props.onConfirm
    await TestRenderer.act(async () => { tree.root.findByProps({ accessibilityLabel: 'chat.operation.remove Run' }).props.onPress(); await Promise.resolve() })
    expect(renderedText(tree.toJSON())).toContain('chat.operation.stale')
    await TestRenderer.act(async () => { oldConfirm(); await Promise.resolve() })
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
    await TestRenderer.act(async () => { tree.root.findByProps({ accessibilityLabel: 'chat.operation.refresh' }).props.onPress(); await Promise.resolve() })
    expect(refresh).toHaveBeenCalledWith('pending-1')
    expect(renderedText(tree.toJSON())).toContain('Read')
    expect(tree.root.findAllByType('ConfirmSheet')).toHaveLength(0)
    await TestRenderer.act(async () => { oldConfirm(); await Promise.resolve() })
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
  })

  it('requires a new confirmation after refresh returns the same fingerprint', async () => {
    const destructive = { ...preview, items: preview.items.map((item) => ({ ...item, removesData: true })), riskClass: 'Destructive' as const, confirmationRequirement: 'FreshConfirmation' as const }
    const revise = vi.fn().mockResolvedValue({ ok: false, error: 'stale_preview', stale: true })
    const refresh = vi.fn().mockResolvedValue({ ok: true, result: { isSuccess: true, error: null,
      pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 2, items: [firstItem, secondItem].map((item) => ({ ...item, removesData: true })), previewFingerprint: 'preview-1' } } })
    const { tree, handlers } = renderCard(destructive, revise, refresh)
    TestRenderer.act(() => press(tree, 'chat.operation.approve').props.onPress())
    const oldConfirm = tree.root.findByType('ConfirmSheet').props.onConfirm
    await TestRenderer.act(async () => { tree.root.findByProps({ accessibilityLabel: 'chat.operation.remove Run' }).props.onPress(); await Promise.resolve() })
    await TestRenderer.act(async () => { tree.root.findByProps({ accessibilityLabel: 'chat.operation.refresh' }).props.onPress(); await Promise.resolve() })
    expect(refresh).toHaveBeenCalledWith('pending-1')
    expect(tree.root.findAllByType('ConfirmSheet')).toHaveLength(0)
    await TestRenderer.act(async () => { oldConfirm(); await Promise.resolve() })
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
    TestRenderer.act(() => press(tree, 'chat.operation.approve').props.onPress())
    expect(tree.root.findAllByType('ConfirmSheet')).toHaveLength(1)
  })

  it('dismisses the native identity sheet when verification reports stale', async () => {
    sheetTestControls.defer(true)
    const highRisk = { ...preview, riskClass: 'High' as const, confirmationRequirement: 'StepUp' as const }
    const { tree, handlers } = renderCard(highRisk, vi.fn(), vi.fn())
    handlers.onPrepareStepUp.mockResolvedValue({ ok: true, challengeId: 'challenge-1', confirmationToken: 'confirmation-1' })
    handlers.onVerifyStepUp.mockResolvedValue({ ok: false, error: 'stale_preview', stale: true })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.stepUpAction').props.onPress(); await Promise.resolve() })
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'stepUp.codeLabel' }).props.onChangeText('123456'))
    await TestRenderer.act(async () => { press(tree, 'stepUp.confirm').props.onPress(); await Promise.resolve() })
    expect(renderedText(tree.toJSON())).toContain('chat.operation.stale')
    expect(sheetTestControls.isDismissPending).toBe(true)
    TestRenderer.act(() => sheetTestControls.completeDismissal())
    expect(tree.root.findAllByType(TextInput).filter((node: any) => node.props.accessibilityLabel === 'stepUp.codeLabel')).toHaveLength(0)
  })

  it('discards prepared identity approval after refresh returns the same fingerprint', async () => {
    sheetTestControls.defer(true)
    const highRisk = { ...preview, riskClass: 'High' as const, confirmationRequirement: 'StepUp' as const }
    const revise = vi.fn().mockResolvedValue({ ok: false, error: 'stale_preview', stale: true })
    const refresh = vi.fn().mockResolvedValue({ ok: true, result: { isSuccess: true, error: null,
      pendingOperationId: 'pending-1', cancelled: false,
      preview: { changes: [], changeTargetCount: 2, items: [firstItem, secondItem], previewFingerprint: 'preview-1' } } })
    const { tree, handlers } = renderCard(highRisk, revise, refresh)
    handlers.onPrepareStepUp.mockResolvedValue({ ok: true, challengeId: 'challenge-1', confirmationToken: 'confirmation-1' })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.stepUpAction').props.onPress(); await Promise.resolve() })
    const oldVerify = tree.root.findAll((node: any) => node.props.prepared?.challengeId === 'challenge-1' && typeof node.props.onVerify === 'function')[0]?.props.onVerify
    await TestRenderer.act(async () => { tree.root.findByProps({ accessibilityLabel: 'chat.operation.remove Run' }).props.onPress(); await Promise.resolve() })
    await TestRenderer.act(async () => { tree.root.findByProps({ accessibilityLabel: 'chat.operation.refresh' }).props.onPress(); await Promise.resolve() })
    expect(sheetTestControls.isDismissPending).toBe(true)
    TestRenderer.act(() => sheetTestControls.completeDismissal())
    expect(tree.root.findAllByType(TextInput).filter((node: any) => node.props.accessibilityLabel === 'stepUp.codeLabel')).toHaveLength(0)
    await oldVerify?.('pending-1', 'challenge-1', '123456', 'confirmation-1')
    expect(handlers.onVerifyStepUp).not.toHaveBeenCalled()
  })

  it('keeps approval blocked after refresh returns conflict', async () => {
    const revise = vi.fn().mockResolvedValue({ ok: false, error: 'stale_preview', stale: true })
    const refresh = vi.fn().mockResolvedValue({ ok: false, error: 'revision_conflict', stale: true })
    const { tree, handlers } = renderCard(preview, revise, refresh)
    await TestRenderer.act(async () => { tree.root.findByProps({ accessibilityLabel: 'chat.operation.remove Run' }).props.onPress(); await Promise.resolve() })
    await TestRenderer.act(async () => { tree.root.findByProps({ accessibilityLabel: 'chat.operation.refresh' }).props.onPress(); await Promise.resolve() })
    expect(renderedText(tree.toJSON())).toContain('chat.operation.staleUnavailable')
    expect(tree.root.findAllByProps({ accessibilityLabel: 'chat.operation.refresh' })).toHaveLength(0)
    expect(renderedText(tree.toJSON())).not.toContain('chat.operation.approve')
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
  })

  it('offers refresh after approval finds a stale preview', async () => {
    const { tree, handlers } = renderCard(preview, vi.fn(), vi.fn())
    handlers.onConfirmExecute.mockResolvedValue({ ok: false, error: 'stale_preview', stale: true })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.approve').props.onPress(); await Promise.resolve() })
    expect(tree.root.findAllByProps({ accessibilityLabel: 'chat.operation.refresh' }).length).toBeGreaterThan(0)
    expect(tree.root.findAllByProps({ accessibilityLabel: 'chat.operation.approve' })).toHaveLength(0)
  })

  it('hides risk and requires confirmation before a destructive operation', async () => {
    const { tree, handlers } = renderCard({ items: [{ ...firstItem, removesData: true }] })
    handlers.onConfirmExecute.mockResolvedValue({
      ok: true,
      response: { operation: { status: 'Succeeded' } },
    })

    expect(renderedText(tree.toJSON())).not.toContain('chat.operation.risk.destructive')
    expect(renderedText(tree.toJSON())).toContain('chat.operation.irreversible')
    TestRenderer.act(() => press(tree, 'chat.operation.approve').props.onPress())
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
    await TestRenderer.act(async () => {
      tree.root.findByType('ConfirmSheet').props.onConfirm()
      await Promise.resolve()
    })
    expect(handlers.onConfirmExecute).toHaveBeenCalledWith('pending-1')
  })

  it('keeps the completed preview and opens its created habit', async () => {
    const onOpenTarget = vi.fn()
    const pendingOperation = makeHeldHabitMessage().pendingOperations![0]!
    const { tree, handlers } = renderCard(pendingOperation, vi.fn(), undefined, onOpenTarget)
    handlers.onConfirmExecute.mockResolvedValue({ ok: true, response: { operation: {
      operationId: 'operation-1', sourceName: 'CreateHabit', riskClass: 'Low',
      confirmationRequirement: 'None', status: 'Succeeded', targetId: 'habit-created', targetName: 'Beber água',
    } } })
    expect(renderedText(tree.toJSON())).toContain('Beber água')
    expect(renderedText(tree.toJSON())).toContain('chat.operation.edit')
    expect(renderedText(tree.toJSON())).toContain('chat.operation.reject')
    await TestRenderer.act(async () => { press(tree, 'chat.operation.approve').props.onPress(); await Promise.resolve() })
    expect(renderedText(tree.toJSON())).toContain('status.done')
    expect(tree.root.findAllByType(Pressable).filter((node: import('react-test-renderer').ReactTestInstance) =>
      node.props.accessibilityLabel === 'Open details: Beber água')).toHaveLength(1)
    TestRenderer.act(() => press(tree, 'chat.action.open').props.onPress())
    expect(onOpenTarget).toHaveBeenCalledWith('habit-created', 'CreateHabit')
  })

  it('shows an execution error and lets the same preview retry', async () => {
    const { tree, handlers } = renderCard(makeHeldHabitMessage().pendingOperations![0], vi.fn())
    handlers.onConfirmExecute.mockResolvedValueOnce({ ok: false, error: 'Could not save. Try again.' })
      .mockResolvedValueOnce({ ok: true, response: { operation: { status: 'Succeeded' } } })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.approve').props.onPress(); await Promise.resolve() })
    expect(renderedText(tree.toJSON())).not.toContain('status.failed')
    expect(renderedText(tree.toJSON())).toContain('chat.operationFailed')
    await TestRenderer.act(async () => { press(tree, 'common.retry').props.onPress(); await Promise.resolve() })
    expect(renderedText(tree.toJSON())).toContain('status.done')
    expect(handlers.onConfirmExecute).toHaveBeenCalledTimes(2)
  })

  it('keeps a terminal operation failure in the preview with localized status', async () => {
    const { tree, handlers } = renderCard(makeHeldHabitMessage().pendingOperations![0], vi.fn())
    handlers.onConfirmExecute.mockResolvedValue({ ok: true, response: { operation: { status: 'Failed', summary: 'Habit could not be created.' } } })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.approve').props.onPress(); await Promise.resolve() })
    expect(renderedText(tree.toJSON())).toContain('chat.operation.unavailableRecovery')
    expect(renderedText(tree.toJSON())).not.toContain('Habit could not be created.')
    expect(renderedText(tree.toJSON())).not.toContain('status.failed')
    expect(press(tree, 'common.retry')).toBeUndefined()
    expect(press(tree, 'chat.operation.approve')).toBeUndefined()
  })

  it('finishes a verified step up even when the native dismissal rejects', async () => {
    const { tree, handlers } = renderCard({ confirmationRequirement: 'StepUp', riskClass: 'High' })
    handlers.onPrepareStepUp.mockResolvedValue({ ok: true, challengeId: 'challenge-1', confirmationToken: 'confirmation-1' })
    handlers.onVerifyStepUp.mockResolvedValue({ ok: true, response: { operation: { status: 'Succeeded' } } })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.stepUpAction').props.onPress(); await Promise.resolve() })
    TestRenderer.act(() => tree.root.findByProps({ accessibilityLabel: 'stepUp.codeLabel' }).props.onChangeText('123456'))
    sheetTestControls.defer(true)
    await TestRenderer.act(async () => { press(tree, 'stepUp.confirm').props.onPress(); await Promise.resolve() })
    TestRenderer.act(() => sheetTestControls.rejectDismissal())

    expect(renderedText(tree.toJSON())).toContain('status.done')
    expect(tree.root.findAllByType(TextInput).filter((node: any) => node.props.accessibilityLabel === 'stepUp.codeLabel')).toHaveLength(0)
  })

  it('hands step up to a sheet, verifies the code, and executes', async () => {
    const { tree, handlers } = renderCard({ confirmationRequirement: 'StepUp', riskClass: 'High' })
    handlers.onPrepareStepUp.mockResolvedValue({
      ok: true,
      challengeId: 'challenge-1',
      confirmationToken: 'confirmation-1',
    })
    handlers.onVerifyStepUp.mockResolvedValue({
      ok: true,
      response: { operation: { status: 'Succeeded' } },
    })

    expect(tree.root.findAll((node: any) => typeof node.props?.onChangeText === 'function')).toHaveLength(0)
    await TestRenderer.act(async () => {
      press(tree, 'chat.operation.stepUpAction').props.onPress()
      await Promise.resolve()
    })
    expect(handlers.onPrepareStepUp).toHaveBeenCalledWith('pending-1')
    const codeInput = tree.root.findByProps({ accessibilityLabel: 'stepUp.codeLabel' })
    TestRenderer.act(() => codeInput.props.onChangeText('123456'))
    await TestRenderer.act(async () => {
      press(tree, 'stepUp.confirm').props.onPress()
      await Promise.resolve()
    })
    expect(handlers.onVerifyStepUp).toHaveBeenCalledWith(
      'pending-1',
      'challenge-1',
      '123456',
      'confirmation-1',
    )
    expect(renderedText(tree.toJSON())).toContain('status.done')
  })

  it('rejects a legacy preview without executing', () => {
    const { tree, handlers } = renderCard()
    TestRenderer.act(() => press(tree, 'chat.operation.reject').props.onPress())

    expect(renderedText(tree.toJSON())).toContain('chat.operation.rejected')
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
  })

  it('does not mark a denied execution as done', async () => {
    const { tree, handlers } = renderCard({ riskClass: 'Low', confirmationRequirement: 'None' })
    handlers.onConfirmExecute.mockResolvedValue({
      ok: true,
      response: { operation: { status: 'Denied' } },
    })
    await TestRenderer.act(async () => {
      press(tree, 'chat.operation.approve').props.onPress()
      await Promise.resolve()
    })

    expect(renderedText(tree.toJSON())).toContain('chat.operation.status.Denied')
    expect(renderedText(tree.toJSON())).not.toContain('status.failed')
    expect(renderedText(tree.toJSON())).not.toContain('status.done')
  })
})

it('renames a proposed title inline, cancels with Escape and retains the full editor', async () => {
  const accessibilityFocus = vi.spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
  const operation = makeCreateHabitsPreview(2)
  const revised = makeCreateHabitsPreview(2)
  revised.previewFingerprint = 'renamed-preview'
  revised.items![0]!.entityName = 'Read books'
  revised.items![0]!.fields[0]!.newValue = 'Read books'
  revised.items![0]!.fields[0]!.proposedValue = 'Read books'
  const revise = vi.fn().mockResolvedValue({ ok: true, result: { isSuccess: true, cancelled: false, pendingOperationId: operation.id, error: null, preview: revised } })
  const { tree, handlers } = renderCard(operation, revise)
  const title = () => tree.root.findAllByType(Pressable).find((node: ReactTestInstance) => node.props.accessibilityLabel === 'Habit 1')!
  expect(title().props.accessibilityState?.expanded).toBeUndefined()
  TestRenderer.act(() => title().props.onPress())
  let input = tree.root.findByType(TextInput)
  TestRenderer.act(() => input.props.onChangeText('Discard me'))
  TestRenderer.act(() => tree.root.findByProps({ testID: 'input-control' }).props.onKeyDown({ nativeEvent: { key: 'Escape' }, stopPropagation: vi.fn() }))
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0)
  expect(revise).not.toHaveBeenCalled()
  expect.soft(accessibilityFocus).toHaveBeenCalledWith(expect.objectContaining({ __nativeTag: title().findAll((node: ReactTestInstance) => typeof node.props.__nativeTag === 'number')[0]!.props.__nativeTag }), 'focus')
  accessibilityFocus.mockClear()
  TestRenderer.act(() => title().props.onPress())
  input = tree.root.findByType(TextInput)
  expect(input.props.value).toBe('Habit 1')
  TestRenderer.act(() => input.props.onChangeText('Read books'))
  await TestRenderer.act(() => { input.props.onSubmitEditing(); input.props.onBlur() })
  expect(revise).toHaveBeenCalledExactlyOnceWith(operation.id, { previewFingerprint: 'create-preview', items: [{ itemId: '0', edits: { title: 'Read books' } }, { itemId: '1' }] })
  expect(renderedText(tree.root)).toContain('Read books')
  const renamed = tree.root.findAllByType(Pressable).find((node: ReactTestInstance) => node.props.accessibilityLabel === 'Read books')!
  expect.soft(accessibilityFocus).toHaveBeenCalledWith(expect.objectContaining({ __nativeTag: renamed.findAll((node: ReactTestInstance) => typeof node.props.__nativeTag === 'number')[0]!.props.__nativeTag }), 'focus')
  accessibilityFocus.mockRestore()
  expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
  TestRenderer.act(() => press(tree, 'chat.operation.edit').props.onPress())
  expect(tree.root.findByType(TextInput).props.value).toBe('Read books')
})

it.each(['en', 'pt-BR'])('shows icons beside readable titles without chevrons or icon instructions in %s', locale => {
  visibleLocale.language = locale
  visibleLocale.actual = true
  const operation = makeCreateHabitsPreview(1)
  const item = operation.items![0]!
  item.fields.push({ ...item.fields[0]!, field: 'emoji', newValue: '🩺', proposedValue: '🩺' })
  const { tree } = renderCard(operation)
  expect(renderedText(tree.root)).toContain('🩺')
  expect(renderedText(tree.root)).toContain('Habit 1')
  const title = tree.root.findAllByType(Pressable).find((node: ReactTestInstance) => node.props.accessibilityLabel === 'Habit 1')!
  expect(title.props.accessibilityState.expanded).toBe(false)
  expect(title.findAll((node: ReactTestInstance) => String(node.type) === 'ChevronDown')).toHaveLength(0)
  expect(renderedText(tree.root)).not.toMatch(/Usar 🩺|Use 🩺/)
})

it('submits a title revision on blur and preserves a failed draft for retry', async () => {
  const operation = makeCreateHabitsPreview(1)
  const reviseTitle = vi.fn().mockResolvedValue({ ok: false, error: 'invalid_revision' })
  const { tree, handlers } = renderCard(operation, reviseTitle)
  TestRenderer.act(() => press(tree, 'Habit 1').props.onPress())
  const input = tree.root.findByType(TextInput)
  TestRenderer.act(() => input.props.onChangeText('Read books'))
  await TestRenderer.act(() => input.props.onBlur())
  expect(reviseTitle).toHaveBeenCalledExactlyOnceWith(operation.id, { previewFingerprint: 'create-preview', items: [{ itemId: '0', edits: { title: 'Read books' } }] })
  expect(tree.root.findByType(TextInput).props.value).toBe('Read books')
  const approve = () => press(tree, 'chat.operation.approveCount.createHabits')
  expect(renderedText(tree.root)).toContain('chat.operation.invalid')
  expect(approve().props.disabled).toBe(true)
  expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
  TestRenderer.act(() => tree.root.findByType(TextInput).props.onChangeText('Habit 1'))
  expect(approve().props.disabled).toBe(false)
  TestRenderer.act(() => tree.root.findByType(TextInput).props.onChangeText('Read books'))
  expect(approve().props.disabled).toBe(true)
  const revised = makeCreateHabitsPreview(1)
  revised.previewFingerprint = 'accepted-title'
  revised.items![0]!.entityName = 'Read books'
  revised.items![0]!.fields[0]!.newValue = 'Read books'
  revised.items![0]!.fields[0]!.proposedValue = 'Read books'
  reviseTitle.mockResolvedValue({ ok: true, result: { isSuccess: true, cancelled: false, pendingOperationId: operation.id, error: null, preview: revised } })
  await TestRenderer.act(() => tree.root.findByType(TextInput).props.onSubmitEditing())
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0)
  expect(approve().props.disabled).toBe(false)
})

it('discards an unmounted title draft after refreshing a stale rename with the same item id', async () => {
  const operation = makeCreateHabitsPreview(1)
  const refreshed = { ...makeCreateHabitsPreview(1), previewFingerprint: 'refreshed-preview' }
  const reviseTitle = vi.fn().mockResolvedValue({ ok: false, stale: true, error: 'stale_preview' })
  const refresh = vi.fn().mockResolvedValue({ ok: true, result: { isSuccess: true, cancelled: false, pendingOperationId: operation.id, error: null, preview: refreshed } })
  const { tree, handlers } = renderCard(operation, reviseTitle, refresh)
  handlers.onConfirmExecute.mockResolvedValue({ ok: true })
  TestRenderer.act(() => press(tree, 'Habit 1').props.onPress())
  const input = tree.root.findByType(TextInput)
  TestRenderer.act(() => input.props.onChangeText('Discarded draft'))
  await TestRenderer.act(() => input.props.onSubmitEditing())
  await TestRenderer.act(() => press(tree, 'chat.operation.refresh').props.onPress())
  expect(refresh).toHaveBeenCalledExactlyOnceWith(operation.id)
  expect(refreshed.items![0]!.itemId).toBe(operation.items![0]!.itemId)
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0)
  expect(press(tree, 'Habit 1')).toBeDefined()
  const approve = press(tree, 'chat.operation.approveCount.createHabits')
  expect(approve.props.disabled).toBe(false)
  await TestRenderer.act(() => approve.props.onPress())
  expect(handlers.onConfirmExecute).toHaveBeenCalledWith(operation.id)
})

it('reveals full deletion names without opening the rename editor', () => {
  const operation = makeDeleteHabitsPreview(2)
  const names = ['Read every book about the places around the world before breakfast in the kitchen', 'Read every book about the places around the world before breakfast on the balcony']
  operation.items!.forEach((item, index) => { item.entityName = names[index]! })
  const { tree } = renderCard(operation)
  for (const name of names) {
    const control = () => tree.root.findAllByType(Pressable).find((node: ReactTestInstance) => node.props.accessibilityLabel === name)!
    TestRenderer.act(() => control().props.onPress())
    expect(control().props.accessibilityState.expanded).toBe(true)
    expect(renderedText(control())).toContain(name)
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0)
    TestRenderer.act(() => control().props.onPress())
  }
})

describe('parent choice previews', () => {
  it.each(['en', 'pt-BR'])('requires only offered parents before approval in %s', async locale => {
    visibleLocale.actual = true
    visibleLocale.language = locale
    const revise = vi.fn().mockReturnValue(new Promise(() => {}))
    const operation = makeParentChoicePreview()
    const { tree, handlers } = renderCard(operation, revise)
    const groups = tree.root.findAll((node: ReactTestInstance) => node.type === ('View' as unknown) && node.props.accessibilityRole === 'radiogroup')
    expect(groups).toHaveLength(2)
    const radios = tree.root.findAll((node: ReactTestInstance) => node.type === ('Pressable' as unknown) && node.props.accessibilityRole === 'radio')
    expect(radios).toHaveLength(6)
    expect(press(tree, locale === 'en' ? 'Create 2 habits' : 'Criar 2 hábitos').props.disabled).toBe(true)
    expect(renderedText(tree.root)).toContain(locale === 'en' ? 'Choose an option for each parent before approving.' : 'Escolha uma opção de hábito principal para cada item antes de aprovar.')
    await TestRenderer.act(async () => { radios[0]!.props.onPress(); await Promise.resolve() })
    expect(revise).toHaveBeenCalledWith(operation.id, { previewFingerprint: operation.previewFingerprint, items: [
      { itemId: '0', edits: { parent_habit_id: '11111111-1111-1111-1111-111111111111' } }, { itemId: '1' },
    ] })
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
  })
})

describe('parent choice revision', () => {
  const radios = (tree: ReactTestRenderer) => tree.root.findAll((node) => node.type === ('Pressable' as unknown) && node.props.accessibilityRole === 'radio')

  it.each(['11111111-1111-1111-1111-111111111111', null])('resolves every item through revision, including %s', async value => {
    const operation = makeParentChoicePreview()
    let accepted = operation
    const revise = vi.fn().mockImplementation((_id, request) => {
      const edit = request.items.find((item: { edits?: Record<string, unknown> }) => item.edits)
      accepted = resolveParentChoicePreview(accepted, edit.itemId, edit.edits.parent_habit_id)
      return Promise.resolve({ ok: true, result: { isSuccess: true, error: null, pendingOperationId: operation.id, preview: accepted, cancelled: false } })
    })
    const { tree, handlers } = renderCard(operation, revise)
    handlers.onConfirmExecute.mockResolvedValue({ ok: true })
    await TestRenderer.act(async () => { (radios(tree)[value === null ? 2 : 0]!.props.onPress as () => void)(); await Promise.resolve() })
    expect(radios(tree)).toHaveLength(3)
    expect(press(tree, 'chat.operation.approveCount').props.disabled).toBe(true)
    await TestRenderer.act(async () => { (radios(tree)[value === null ? 2 : 0]!.props.onPress as () => void)(); await Promise.resolve() })
    expect(radios(tree)).toHaveLength(0)
    expect(revise).toHaveBeenLastCalledWith(operation.id, { previewFingerprint: 'parent-choice-preview-0', items: [{ itemId: '0' }, { itemId: '1', edits: { parent_habit_id: value } }] })
    expect(press(tree, 'chat.operation.approveCount').props.disabled).toBe(false)
    await TestRenderer.act(async () => { press(tree, 'chat.operation.approveCount').props.onPress(); await Promise.resolve() })
    expect(handlers.onConfirmExecute).toHaveBeenCalledWith(operation.id)
  })

  it('shows a resolved parent name without choices', () => {
    const { tree } = renderCard(resolveParentChoicePreview(makeParentChoicePreview(1), '0', '11111111-1111-1111-1111-111111111111'), vi.fn())
    expect(radios(tree)).toHaveLength(0)
    expect(renderedText(tree.root)).toContain('Post Lunch')
    expect(press(tree, 'chat.operation.approveCount').props.disabled).toBe(false)
  })

  it('discards a late choice response after replacement', async () => {
    const operation = makeParentChoicePreview(1)
    const settled = vi.fn()
    let finish!: (response: PendingOperationRevisionResponse) => void
    const revise = vi.fn().mockReturnValue(new Promise<PendingOperationRevisionResponse>(resolve => { finish = resolve }))
    const { tree, handlers } = renderCard(operation, revise)
    const props = { ...handlers, onRevise: revise, onStateChange: settled }
    TestRenderer.act(() => { tree.update(<PendingOperationCard pendingOperation={operation} {...props} />) })
    await TestRenderer.act(async () => { (radios(tree)[0]!.props.onPress as () => void)(); await Promise.resolve() })
    const replacement = { ...makeParentChoicePreview(1), previewFingerprint: 'replacement' }
    replacement.items![0]!.fieldOptions![0]!.options = [{ value: null, label: 'No parent' }]
    TestRenderer.act(() => { tree.update(<PendingOperationCard pendingOperation={replacement} {...props} />) })
    await TestRenderer.act(async () => { finish({ ok: true, result: { isSuccess: true, error: null, pendingOperationId: operation.id, preview: { ...resolveParentChoicePreview(operation, '0', null), changes: [], changeTargetCount: 1 }, cancelled: false } }); await Promise.resolve() })
    expect(settled).not.toHaveBeenCalled()
    expect(radios(tree)).toHaveLength(1)
    expect(radios(tree)[0]!.props.accessibilityLabel).toBe('habits.moveParent.toRoot')
    expect(press(tree, 'chat.operation.approveCount').props.disabled).toBe(true)
  })

  it('retains unresolved options after a revision failure and replaces them on a new preview', async () => {
    const revise = vi.fn().mockResolvedValue({ ok: false, error: 'option_not_offered' })
    const { tree, handlers } = renderCard(makeParentChoicePreview(1), revise)
    await TestRenderer.act(async () => { (radios(tree)[0]!.props.onPress as () => void)(); await Promise.resolve() })
    expect(renderedText(tree.root)).toContain('chat.operation.invalid')
    expect(press(tree, 'chat.operation.approveCount').props.disabled).toBe(true)
    expect(radios(tree)).toHaveLength(3)
    const replacement = makeParentChoicePreview(1)
    replacement.previewFingerprint = 'replacement'
    replacement.items![0]!.fieldOptions![0]!.options = [{ value: null, label: 'No parent' }]
    TestRenderer.act(() => { tree.update(<PendingOperationCard pendingOperation={replacement} onRevise={revise} {...handlers} />) })
    expect(radios(tree)).toHaveLength(1)
    expect(radios(tree)[0]!.props.accessibilityLabel).toBe('habits.moveParent.toRoot')
    expect(press(tree, 'chat.operation.approveCount').props.disabled).toBe(true)
  })

  it('keeps older previews unchanged and permits rejection of an unresolved batch', async () => {
    const revise = vi.fn().mockResolvedValue({ ok: true, result: { isSuccess: true, error: null, pendingOperationId: null, preview: null, cancelled: true } })
    const { tree, handlers } = renderCard(makeCreateHabitsPreview(1), revise)
    expect(radios(tree)).toHaveLength(0)
    expect(press(tree, 'chat.operation.approveCount').props.disabled).toBe(false)
    TestRenderer.act(() => { tree.update(<PendingOperationCard pendingOperation={makeParentChoicePreview(1)} onRevise={revise} {...handlers} />) })
    await TestRenderer.act(async () => { press(tree, 'chat.operation.reject').props.onPress(); await Promise.resolve() })
    expect(revise).toHaveBeenCalledWith(expect.any(String), { previewFingerprint: 'parent-choice-preview', items: [] })
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
  })
})


describe('parent choice keyboard focus', () => {
  const radios = (tree: ReactTestRenderer) => tree.root.findAll((node: ReactTestInstance) => node.type === ('Pressable' as unknown) && node.props.accessibilityRole === 'radio')
  it.each([2, 1, 0])('retains native focus through revision with continuation %i', async count => {
    __setTouchMode(false)
    const operation = makeParentChoicePreview(count || 1)
    let finish!: (response: PendingOperationRevisionResponse) => void
    const onRevise = vi.fn().mockReturnValue(new Promise<PendingOperationRevisionResponse>(resolve => { finish = resolve }))
    const { tree } = renderCard(operation, onRevise, undefined, undefined, true)
    const chosen = radios(tree)[0]!
    const chosenTag = chosen.props.__nativeTag as number
    TestRenderer.act(() => { __focusHost(chosenTag) })
    await TestRenderer.act(async () => { (chosen.props.onPress as () => void)(); await Promise.resolve() })
    expect.soft(__getFocusedNativeTag()).toBe(chosenTag)
    expect(onRevise).toHaveBeenCalledOnce()
    await TestRenderer.act(async () => { finish(count === 0 ? { ok: false, error: 'option_not_offered' } : { ok: true, result: { isSuccess: true, error: null, pendingOperationId: operation.id, preview: { ...resolveParentChoicePreview(operation, '0', '11111111-1111-1111-1111-111111111111'), changes: [], changeTargetCount: count || 1 }, cancelled: false } }); await Promise.resolve() })
    const destination = count === 2 ? radios(tree)[0]! : count === 0 ? radios(tree)[0]! : tree.root.findAll((node: ReactTestInstance) => node.type === ('Pressable' as unknown) && node.props.accessibilityRole === 'button' && renderedText(node.props.children).includes('chat.operation.approveCount'))[0]!
    expect(__getFocusedNativeTag()).toBe(destination.props.__nativeTag)
  })
})


it('preserves native focus moved elsewhere during a parent revision', async () => {
  __setTouchMode(false)
  const operation = makeParentChoicePreview()
  let finish!: (response: PendingOperationRevisionResponse) => void
  const onRevise = vi.fn().mockReturnValue(new Promise<PendingOperationRevisionResponse>(resolve => { finish = resolve }))
  let tree!: ReactTestRenderer
  TestRenderer.act(() => { tree = TestRenderer.create(withFocusProvenance(<><Pressable accessibilityLabel="Elsewhere" /><PendingOperationCard pendingOperation={operation} onRevise={onRevise} onConfirmExecute={vi.fn()} onPrepareStepUp={vi.fn()} onVerifyStepUp={vi.fn()} /></>)) })
  const chosen = tree.root.findAll((node: ReactTestInstance) => node.type === ('Pressable' as unknown) && node.props.accessibilityRole === 'radio')[0]!
  TestRenderer.act(() => { __focusHost(chosen.props.__nativeTag as number) })
  await TestRenderer.act(async () => { (chosen.props.onPress as () => void)(); await Promise.resolve() })
  const elsewhere = tree.root.findAll((node: ReactTestInstance) => node.type === ('Pressable' as unknown) && node.props.accessibilityLabel === 'Elsewhere')[0]!
  TestRenderer.act(() => { __focusHost(elsewhere.props.__nativeTag as number) })
  await TestRenderer.act(async () => { finish({ ok: true, result: { isSuccess: true, error: null, pendingOperationId: operation.id, preview: { ...resolveParentChoicePreview(operation, '0', null), changes: [], changeTargetCount: 2 }, cancelled: false } }); await Promise.resolve() })
  expect(__getFocusedNativeTag()).toBe(elsewhere.props.__nativeTag)
})


it('edits an offered parent in Full Edit before saving the preview', async () => {
  const operation = makeParentChoicePreview(1)
  const onRevise = vi.fn().mockResolvedValue({ ok: false, error: 'invalid_revision' })
  const { tree } = renderCard(operation, onRevise)
  TestRenderer.act(() => { press(tree, 'chat.operation.edit').props.onPress() })
  const choices = tree.root.findAll((node: ReactTestInstance) => node.type === ('Pressable' as unknown) && node.props.accessibilityRole === 'radio')
  TestRenderer.act(() => { (choices[choices.length - 1]!.props.onPress as () => void)() })
  expect(onRevise).not.toHaveBeenCalled()
  await TestRenderer.act(async () => { press(tree, 'common.save').props.onPress(); await Promise.resolve() })
  expect(onRevise).toHaveBeenCalledWith(operation.id, { previewFingerprint: operation.previewFingerprint, items: [{ itemId: '0', edits: { parent_habit_id: null } }] })
})
