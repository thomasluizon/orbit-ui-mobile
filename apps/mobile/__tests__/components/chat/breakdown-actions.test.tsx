import React from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { breakdownSubHabits, makeBulkCreateResponse } from '@orbit/shared/test-support/chat-fixtures'
import { BreakdownSuggestion } from '@/components/chat/breakdown-suggestion'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { sheetTestControls } from '@/__tests__/support/sheet-double'
import { renderedText } from '../../support/react-test-renderer'

vi.unmock('react-i18next')
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
const bulkCreate = vi.fn()
vi.mock('@/hooks/use-habits', () => ({ useBulkCreateHabits: () => ({ mutateAsync: bulkCreate, isPending: false }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/components/ui/confirm-sheet', () => ({
  ConfirmSheet: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) => open ? React.createElement('Confirmation', { onConfirm }) : null,
}))

function control(tree: ReactTestRenderer, role: string, name: string) {
  const node = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === role &&
    (node.props.accessibilityLabel === name || renderedText(node.props.children).trim() === name))[0]
  expect(node).toBeDefined()
  return node!
}

function press(node: ReactTestInstance) { (node.props.onPress as () => void)() }

afterEach(() => { __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 }); sheetTestControls.defer(false) })

it.each([320, 1352].flatMap(width => (['en', 'pt-BR'] as const).map(locale => ({ width, locale }))))(
  'keeps actions touch reachable and drafts intact at $width in $locale', async ({ width, locale }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    const messages = locale === 'en' ? en : pt
    const i18n = createInstance()
    await i18n.use(initReactI18next).init({ lng: locale, resources: { en: { translation: en }, 'pt-BR': { translation: pt } }, interpolation: { prefix: '{', suffix: '}', escapeValue: false } })
    bulkCreate.mockReset().mockResolvedValue(makeBulkCreateResponse(['Success', 'Success', 'Success']))
    const onConfirmed = vi.fn()
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<I18nextProvider i18n={i18n}><BreakdownSuggestion parentName="House routine" subHabits={breakdownSubHabits} onConfirmed={onConfirmed} onCancelled={vi.fn()} /></I18nextProvider>) })
    try {
      const footer = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'action-row')[0]!
      expect(footer.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button')).toHaveLength(3)
      expect(footer.findAll(node => typeof node.type === 'string' && node.props.testID === 'button-primary-sm')).toHaveLength(1)
      const more = () => control(tree, 'button', messages.habits.actions.more)
      expect(more().props.accessibilityState).toMatchObject({ expanded: false })
      await act(() => press(more()))
      expect(more().props.accessibilityState).toMatchObject({ expanded: true })
      expect(control(tree, 'menuitem', messages.chat.preview.reject).props.disabled).toBe(false)
      if (width < 900) sheetTestControls.defer(true)
      await act(() => press(control(tree, 'menuitem', messages.chat.preview.edit)))
      if (width < 900) {
        expect(tree.root.findAll(node => typeof node.type === 'string' && typeof node.props.onChangeText === 'function')).toHaveLength(0)
        await act(() => sheetTestControls.completeDismissal())
        sheetTestControls.defer(false)
      }
      const input = tree.root.findAll(node => typeof node.type === 'string' && typeof node.props.onChangeText === 'function')[0]!
      await act(() => (input.props.onChangeText as (title: string) => void)('Kitchen dishes'))
      await act(() => press(control(tree, 'button', messages.habits.breakdown.addHabit)))
      const added = tree.root.findAll(node => typeof node.type === 'string' && typeof node.props.onChangeText === 'function')[0]!
      await act(() => (added.props.onChangeText as (title: string) => void)('Sweep'))
      await act(() => press(more()))
      expect(control(tree, 'menuitem', messages.chat.preview.edit).props.disabled).toBe(false)
      if (width < 900) {
        await act(() => (tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === 'attempt-dismiss')[0]!.props.onPress as () => void)())
      } else {
        await act(() => (tree.root.findAll(node => typeof node.type === 'string' && node.props.onRequestClose != null)[0]!.props.onRequestClose as () => void)())
      }
      expect(renderedText(tree.root)).toContain('Kitchen dishes')
      expect(added.props.value).toBe('Sweep')
      await act(() => press(control(tree, 'button', messages.chat.preview.approve)))
      await act(async () => { (tree.root.findAll(node => String(node.type) === 'Confirmation')[0]!.props.onConfirm as () => void)(); await Promise.resolve() })
      expect(onConfirmed).toHaveBeenCalledTimes(1)
      expect(bulkCreate.mock.calls[0]![0].habits.map((habit: { title: string }) => habit.title)).toEqual(['Kitchen dishes', 'Laundry', 'Sweep'])
    } finally { await act(() => tree.update(<></>)) }
  },
)
