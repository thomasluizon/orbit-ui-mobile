import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Pressable, Text } from 'react-native'
import { HabitDetailResultDialog, HabitDetailUnavailable, useHabitDetailResult } from '@/components/habits/habit-detail-result'
import { press, renderNavigation } from '../ui/navigation-render'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: Record<string, string>) => values?.date ? `${key}|${values.date}` : key }),
}))

const orbit = (tree: ReturnType<typeof renderNavigation>) => tree.hosts().find((node) => (node.props as Record<string, unknown>)['data-orbit-state'] !== undefined)!.props as Record<string, unknown>

describe('Android habit detail result dialog', () => {
  it('states the new date after an accepted reschedule, with Orbit in Feliz and a way to Hoje', () => {
    const onSeeToday = vi.fn()
    const tree = renderNavigation(<HabitDetailResultDialog result={{ kind: 'rescheduled', date: 'Nov 20' }} onSeeToday={onSeeToday} onClose={vi.fn()} />)
    const panel = tree.hosts().find((node) => node.props.testID === 'result-dialog')!
    expect(panel.props).toMatchObject({ accessibilityLabel: 'result.title', accessibilityHint: 'result.habit.rescheduled|Nov 20' })
    expect(orbit(tree)['data-orbit-state']).toBe('feliz')
    press(tree.hosts().find((node) => node.props.testID === 'button-primary-sm')!)
    expect(onSeeToday).toHaveBeenCalledTimes(1)
    tree.unmount()
  })

  it('shows Orbit in Parado after a delete and states the fact', () => {
    const tree = renderNavigation(<HabitDetailResultDialog result={{ kind: 'deleted' }} onSeeToday={vi.fn()} onClose={vi.fn()} />)
    expect(tree.hosts().find((node) => node.props.testID === 'result-dialog')!.props).toMatchObject({ accessibilityHint: 'result.habit.deleted' })
    expect(orbit(tree)['data-orbit-state']).toBe('parado')
    tree.unmount()
  })

  it.each([['on', true], ['off', false]])('never brings back the load error while detail leaves after a delete, with the guided flows %s', (_label, guided) => {
    const seeToday = vi.fn()
    function Detail() {
      const host = useHabitDetailResult(seeToday)
      return <>
        <Pressable testID="delete" onPress={host.deleted} />
        <HabitDetailUnavailable result={host.result} habitDeleted={host.habitDeleted} onSeeToday={host.seeToday} onClose={host.close}>
          <Text testID="load-error">habits.detail.loadError</Text>
        </HabitDetailUnavailable>
      </>
    }
    const tree = renderNavigation(<Detail />)
    const find = (testID: string) => tree.hosts().find((node) => node.props.testID === testID)
    expect(find('load-error')).toBeDefined()
    press(find('delete')!)
    if (guided) {
      expect(find('result-dialog')).toBeDefined()
      expect(find('load-error')).toBeUndefined()
      press(find('button-primary-sm')!)
      expect(find('result-dialog')).toBeUndefined()
    }
    expect(seeToday).toHaveBeenCalledOnce()
    expect(find('load-error')).toBeUndefined()
    tree.unmount()
  })

  it('closes on the scrim and renders nothing without a result', () => {
    const onClose = vi.fn()
    const tree = renderNavigation(<HabitDetailResultDialog result={{ kind: 'deleted' }} onSeeToday={vi.fn()} onClose={onClose} />)
    press(tree.hosts().find((node) => node.props.testID === 'result-dialog-scrim')!)
    expect(onClose).toHaveBeenCalledTimes(1)
    tree.update(<HabitDetailResultDialog result={null} onSeeToday={vi.fn()} onClose={onClose} />)
    expect(tree.hosts().find((node) => node.props.testID === 'result-dialog')).toBeUndefined()
    tree.unmount()
  })
})
