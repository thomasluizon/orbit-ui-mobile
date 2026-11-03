import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { Animated, StyleSheet, type TextStyle } from 'react-native'
import { PlanAnnouncements, PlanBlock } from '@/components/chat/plan-block'
import type { ChatMessage } from '@orbit/shared/types'
import { makeAstraPlan } from '@orbit/shared/test-support/astra-plan-fixtures'
import { i18n } from '@/lib/i18n'
import { createTokensV2 } from '@/lib/theme'
import { __setWindowDimensions } from '@/test-mocks/react-native'

vi.unmock('react-i18next')
vi.mock('@/lib/motion', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/motion')>(),
  usePrefersReducedMotion: () => true,
}))
afterEach(async () => { await i18n.changeLanguage('en'); __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 }) })

describe.each(['en', 'pt-BR'])('native Astra plan in %s', locale => {
  it('announces later running steps on a restored plan without replaying its saved activity', async () => {
    await i18n.changeLanguage(locale)
    const plan = makeAstraPlan(locale)
    const message: ChatMessage = { id: 'restored', role: 'ai', content: '', timestamp: new Date(), restored: true, plan: { ...plan, steps: [{ ...plan.steps[0]!, status: 'running' }, plan.steps[1]!] } }
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<PlanAnnouncements messages={[message]} />) })
    try {
      const announcement = () => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'plan-announcement')[0]!
      expect(announcement().props.children).toBe('')
      await act(() => tree.update(<PlanAnnouncements messages={[{ ...message, plan: { ...plan, steps: plan.steps.map(step => ({ ...step, status: 'running' })) } }]} />))
      expect(announcement().props.children).toBe(`${plan.steps[1]!.text}: ${i18n.t('blockFrame.status.acting')}`)
      expect(announcement().props.accessibilityLiveRegion).toBe('polite')
    } finally { await act(() => tree.unmount()) }
  })

  it('settles progress updates immediately with reduced motion', async () => {
    const timing = vi.spyOn(Animated, 'timing')
    const plan = makeAstraPlan(locale)
    let tree!: ReactTestRenderer
    try {
      await act(() => { tree = create(<PlanBlock plan={plan} />) })
      await act(() => tree.update(<PlanBlock plan={{ ...plan, steps: plan.steps.map(step => ({ ...step, status: 'done' })) }} />))
      expect(timing).not.toHaveBeenCalled()
    } finally { await act(() => tree.unmount()); timing.mockRestore() }
  })

  it.each(['pending', 'running', 'done', 'failed', 'skipped', 'future'])('exposes %s without treating it as completed', async status => {
    await i18n.changeLanguage(locale)
    const plan = makeAstraPlan(locale)
    plan.steps[0]!.status = status
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<PlanBlock plan={plan} />) })
    try {
      const hosts = tree.root.findAll(node => typeof node.type === 'string')
      const list = hosts.find(node => node.props.accessibilityRole === 'list')!
      expect(list.props.accessibilityLabel).toBe(`${i18n.t('chat.plan.title')}: ${plan.title}`)
      const row = hosts.find(node => node.props.role === 'listitem')!
      const label = status === 'running' ? 'blockFrame.status.acting' : status === 'done' ? 'blockFrame.status.done' : status === 'failed' ? 'blockFrame.status.failed' : status === 'skipped' ? 'habits.statusDot.skip' : 'chat.habitList.pending'
      expect(row.props.accessibilityLabel).toBe(`${plan.steps[0]!.text}, ${i18n.t(label)}`)
      const text = row.findAll(node => typeof node.type === 'string' && node.props.children === plan.steps[0]!.text)[0]!
      expect(StyleSheet.flatten(text.props.style as TextStyle).textDecorationLine).toBe(status === 'done' ? 'line-through' : 'none')
      const progress = hosts.find(node => node.props.accessibilityRole === 'progressbar')!
      expect(progress.props.accessibilityValue).toEqual({ min: 0, max: 2, now: status === 'done' ? 1 : 0 })
      expect(progress.props.accessibilityLabel).toBe(`${status === 'done' ? 1 : 0} ${locale === 'en' ? 'of' : 'de'} 2`)
      if (status === 'failed') {
        const color = createTokensV2('purple', 'dark').statusBadText
        expect(StyleSheet.flatten(text.props.style as TextStyle).color).toBe(color)
        expect(row.findAll(node => node.props.size === 16 && node.props.strokeWidth === 1.5)[0]!.props.color).toBe(color)
      }
    } finally { await act(() => tree.unmount()) }
  })

  it.each([412, 1352])('keeps the frame and wrapping step styles at %s', async width => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 2 })
    await i18n.changeLanguage(locale)
    const plan = makeAstraPlan(locale)
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<PlanBlock plan={plan} />) })
    try {
      const block = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === `astra-plan-${plan.id}`)[0]!
      expect(StyleSheet.flatten(block.props.style)).toMatchObject({ width: '100%', minWidth: 0 })
      const frame = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'block-frame-resting')[0]!
      expect(StyleSheet.flatten(frame.props.style)).toMatchObject({ padding: 16, gap: 12 })
      const before = tree.root.findAll(node => typeof node.type === 'string' && node.props.role === 'listitem')[0]!
      expect(StyleSheet.flatten(before.props.style)).toMatchObject({ gap: 12, minWidth: 0 })
      await act(() => tree.update(<PlanBlock plan={{ ...plan, steps: plan.steps.map(step => ({ ...step, status: 'done' })) }} />))
      expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.role === 'listitem')[0]).toBe(before)
      const progress = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'progressbar')[0]!
      expect(progress.props.accessibilityValue).toMatchObject({ now: 2 })
    } finally { await act(() => tree.unmount()) }
  })
})
