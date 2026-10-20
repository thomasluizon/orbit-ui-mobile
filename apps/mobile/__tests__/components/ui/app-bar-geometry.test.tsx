import { StyleSheet, Text, Pressable, type TextStyle } from 'react-native'
import { act, create } from 'react-test-renderer'
import { describe, expect, it } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { AppBar } from '@/components/ui/app-bar'
import { Badge } from '@/components/ui/badge'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'

type Host = Parameters<typeof measureProfileRow>[0]
interface HeaderTree {
  root: { findByType: (type: unknown) => { props: { style: TextStyle } } }
  toJSON: () => Host
  unmount: () => void
}

describe('Android closed header and badge geometry', () => {
  it.each([en, ptBR].flatMap((messages) => [1, 2].map((scale) => ({ messages, scale }))))('keeps titles readable at 320 and $scale text scale in $messages.chat.title', ({ messages, scale }) => {
    const titles = [messages.chat.title, messages.habits.detail.screenTitle, messages.habits.form.newHabit, messages.habits.createSubHabit, messages.progressScreen.sections.goals, messages.deleteAccount.title, '']
    for (const title of titles) {
      let tree!: HeaderTree
      void act(() => { tree = create(<AppBar title={title} onBack={() => {}} backLabel={messages.common.back} action={<Pressable style={{ width: 48, height: 48 }} />} />) as unknown as HeaderTree })
      const style = StyleSheet.flatten(tree.root.findByType(Text).props.style)
      expect(style.fontSize).toBe(12)
      expect(style.textTransform).toBeUndefined()
      expect(style.letterSpacing).toBeUndefined()
      expect(style.textAlign).toBe('left')
      const geometry = measureProfileRow(tree.toJSON(), 320, scale)
      expect(geometry.height).toBeGreaterThanOrEqual(56)
      for (const label of geometry.texts) {
        if (scale === 1) expect(label.lines).toBe(1)
        expect(label.clipped).toBe(false)
        expect(label.right).toBeLessThanOrEqual(304)
      }
      void act(() => { tree.unmount() })
    }
  })

  it.each([en, ptBR])('keeps badge labels at the floor and complete in $common.back', (messages) => {
    for (const label of ['Pro', messages.upgrade.plans.recommended, 'Focus']) {
      let tree!: HeaderTree
      void act(() => { tree = create(<Badge>{label}</Badge>) as unknown as HeaderTree })
      expect(StyleSheet.flatten(tree.root.findByType(Text).props.style).fontSize).toBe(12)
      const geometry = measureProfileRow(tree.toJSON(), 320, 1)
      expect(geometry.texts).toHaveLength(1)
      expect(geometry.texts[0]).toMatchObject({ label, lines: 1, clipped: false })
      void act(() => { tree.unmount() })
    }
  })
})
