import React from 'react'
import { StyleSheet, type ViewStyle } from 'react-native'
import Yoga from 'yoga-layout'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { describe, expect, it, vi } from 'vitest'
import { HabitUnderstanding } from '@/components/habits/habit-form-fields/habit-understanding'
import { buildHabitUnderstandingLabels } from '@orbit/shared/utils'

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/components/habits/habit-form-fields/habit-emoji-selector', () => ({ HabitEmojiSelector: () => null }))


describe('native habit understanding geometry', () => {
  it.each([412, 1280].flatMap((width) => (['en', 'pt-BR'] as const).flatMap((locale) => [false, true].map((proposed) => ({ width, proposed, locale })))))('keeps seven days on one row in $locale at $width, proposed: $proposed', ({ width, proposed, locale }) => {
    const messages = locale === 'en' ? en : ptBR
    const labels = buildHabitUnderstandingLabels((key) => key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], messages) as string)
    const dayOptions = Object.entries(messages.dates.daysShort).map(([day, label]) => ({ value: day.charAt(0).toUpperCase() + day.slice(1), label, accessibleLabel: day }))
    let tree!: ReturnType<typeof renderer.create>
    void renderer.act(() => {
      tree = renderer.create(<HabitUnderstanding value="Read every Monday" emoji="" days={['Monday']} dayOptions={dayOptions}
        quantity={3} mode="fixed" sentence="every Monday" proposed={proposed} consumed={[]} labels={labels}
        onValueChange={vi.fn()} onEmojiSelect={vi.fn()} onToggleDay={vi.fn()} onQuantityChange={vi.fn()} />)
    })
    const preview = tree.root.findAll((node) => String(node.type) === 'View' && node.props.accessibilityLabel === labels.understood)[0]!
    const previewStyle = StyleSheet.flatten(preview.props.style) as ViewStyle
    const dayRow = tree.root.findAll((node) => String(node.type) === 'View' && node.props.accessibilityLabel === labels.days)[0]!
    const dayStyle = StyleSheet.flatten(dayRow.props.style) as ViewStyle
    const wrapper = Yoga.Node.create()
    wrapper.setWidth(Math.min(width, 592) - 32)
    const proposal = tree.root.findAll((node) => String(node.type) === 'View' && node.props.testID === 'proposed-block')[0]
    if (proposal) wrapper.setBorder(Yoga.EDGE_ALL, (StyleSheet.flatten(proposal.props.style) as ViewStyle).borderWidth ?? 0)
    const card = Yoga.Node.create()
    card.setPadding(Yoga.EDGE_ALL, previewStyle.padding as number)
    card.setBorder(Yoga.EDGE_ALL, previewStyle.borderWidth ?? 0)
    wrapper.insertChild(card, 0)
    const row = Yoga.Node.create()
    row.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
    row.setFlexWrap(Yoga.WRAP_WRAP)
    row.setGap(Yoga.GUTTER_ALL, dayStyle.gap as number)
    card.insertChild(row, 0)
    const targets = dayOptions.map((day, index) => {
      const host = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === day.accessibleLabel)[0]!
      const style = StyleSheet.flatten(typeof host.props.style === 'function' ? host.props.style({ pressed: false }) : host.props.style) as ViewStyle
      const target = Yoga.Node.create()
      target.setWidth(style.width as number)
      target.setHeight(style.height as number)
      row.insertChild(target, index)
      return target
    })
    try {
      wrapper.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR)
      expect(new Set(targets.map((target) => target.getComputedTop())).size).toBe(1)
      expect(targets.every((target) => target.getComputedWidth() === 44)).toBe(true)
    } finally {
      wrapper.freeRecursive()
      void renderer.act(() => tree.update(<></>))
    }
  })
})
