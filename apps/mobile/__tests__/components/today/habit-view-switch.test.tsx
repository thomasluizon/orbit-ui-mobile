import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveView } from '@orbit/shared/stores'
import { HabitViewSwitch } from '@/components/today/habit-view-switch'
import { i18n } from '@/lib/i18n'
import { press, renderNavigation } from '../ui/navigation-render'
import { __resetTestHostConfig } from '../../../test-mocks/react-native'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }),
}))

function Example({ onChange }: Readonly<{ onChange: (view: ActiveView) => void }>) {
  const [value, setValue] = useState<ActiveView>('today')
  return <HabitViewSwitch value={value} onChange={(next) => { setValue(next); onChange(next) }} />
}

describe.each(['en', 'pt-BR'])('HabitViewSwitch in %s', (locale) => {
  beforeEach(async () => {
    __resetTestHostConfig()
    await i18n.changeLanguage(locale)
  })

  it('keeps every view natively focusable and checks each destination once', () => {
    const onChange = vi.fn()
    const tree = renderNavigation(<Example onChange={onChange} />)
    const radios = () => tree.hosts().filter((node) => node.props.accessibilityRole === 'radio')
    try {
      expect(tree.hosts().some((node) => node.props.accessibilityRole === 'radiogroup'
        && node.props.accessibilityLabel === i18n.t('habits.viewsLabel'))).toBe(true)
      expect(radios().map((node) => node.props.focusable)).toEqual([true, true, true])
      for (const index of [0, 1, 2]) {
        tree.focus(radios()[index]!)
        expect(radios().map((node) => node.props.accessibilityState?.checked)).toEqual([0, 1, 2].map((candidate) => candidate === index))
      }
      expect(onChange.mock.calls).toEqual([['all'], ['general']])
      press(radios()[0]!)
      expect(radios()[0]!.props.accessibilityState?.checked).toBe(true)
      expect(onChange.mock.calls).toEqual([['all'], ['general'], ['today']])
    } finally {
      tree.unmount()
    }
  })
})
