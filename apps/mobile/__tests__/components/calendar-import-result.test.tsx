import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CalendarImportResult } from '@/app/(tabs)/calendar/_components/calendar-import-result'

const state = vi.hoisted((): { locale: 'en' | 'pt-BR'; push: ReturnType<typeof vi.fn> } => ({ locale: 'en', push: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('react-i18next', async () => {
  const messages = { en: (await import('@orbit/shared/i18n/en.json')).default, 'pt-BR': (await import('@orbit/shared/i18n/pt-BR.json')).default }
  const { IntlMessageFormat: Format } = await import('intl-messageformat')
  const t = (key: string, values?: Record<string, string | number>) => {
    const message = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages[state.locale])
    return typeof message === 'string' ? String(new Format(message, state.locale).format(values)) : key
  }
  return { useTranslation: () => ({ t, i18n: { language: state.locale } }) }
})

const TestRenderer = require('react-test-renderer')

interface TestNode {
  readonly type: unknown
  readonly props: Readonly<Record<string, unknown>>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}

function render(element: ReactElement): { root: TestNode } {
  let tree: { root: TestNode } | undefined
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  return tree!
}

afterEach(() => { state.locale = 'en'; state.push.mockReset() })

describe('the result dialog of a calendar import on Android', () => {
  it.each([
    ['en', 1, 'Done!', '1 habit was created from your calendar.', 'View in Today'],
    ['en', 3, 'Done!', '3 habits were created from your calendar.', 'View in Today'],
    ['pt-BR', 1, 'Pronto!', '1 hábito foi criado a partir da sua agenda.', 'Ver no Hoje'],
    ['pt-BR', 3, 'Pronto!', '3 hábitos foram criados a partir da sua agenda.', 'Ver no Hoje'],
  ] as const)('states the server count in %s (%i) and opens Hoje', (locale, count, title, sentence, action) => {
    state.locale = locale
    const onClose = vi.fn()
    const tree = render(<CalendarImportResult count={count} onClose={onClose} />)
    const dialog = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'result-dialog')[0]!
    expect(dialog.props.accessibilityLabel).toBe(title)
    expect(dialog.props.accessibilityHint).toBe(sentence)
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props['data-orbit-state'] === 'feliz')).toHaveLength(1)
    const primary = tree.root.findAll((node) => typeof node.props.onClick === 'function' && node.props.children === action)[0]!
    TestRenderer.act(() => (primary.props.onClick as () => void)())
    expect(onClose).toHaveBeenCalled()
    expect(state.push).toHaveBeenCalledWith('/(tabs)')
  })

  it('is absent until an import succeeds', () => {
    const tree = render(<CalendarImportResult count={null} onClose={vi.fn()} />)
    expect(tree.root.findAll((node) => node.props.testID === 'result-dialog')).toHaveLength(0)
  })
})
