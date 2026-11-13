import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { HabitDetailResultDialog } from '@/components/habits/habit-detail-result'
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
    expect(tree.hosts().find((node) => node.props.testID === 'result-dialog')!.props.accessibilityHint).toBe('result.habit.deleted')
    expect(orbit(tree)['data-orbit-state']).toBe('parado')
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
