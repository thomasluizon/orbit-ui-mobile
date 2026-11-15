import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { HabitDetailLoadError } from '@/components/habits/habit-detail-load-error'
import { press, renderNavigation } from '../ui/navigation-render'

const mascots = (tree: ReturnType<typeof renderNavigation>) => tree.hosts().filter((node) => (node.props as Record<string, unknown>)['data-orbit-state'] !== undefined)

describe('Android habit detail load error', () => {
  it('shows Orbit in Parado above the message and the retry, in the centred region', () => {
    enableTestFlags('orbit_guided_flows')
    const onRetry = vi.fn()
    const tree = renderNavigation(<HabitDetailLoadError message="Could not load" retryLabel="Retry" onRetry={onRetry} />)
    expect(mascots(tree)).toHaveLength(1)
    expect((mascots(tree)[0]!.props as Record<string, unknown>)['data-orbit-state']).toBe('parado')
    expect(tree.hosts().some((node) => node.props.testID === 'shell-centred-region')).toBe(true)
    expect(tree.hosts().some((node) => node.props.testID === 'habit-detail-load-error')).toBe(true)
    press(tree.hosts().find((node) => node.props.accessibilityLabel === 'Retry')!)
    expect(onRetry).toHaveBeenCalledOnce()
    tree.unmount()
  })

  it('renders the current error with the flag off', () => {
    const tree = renderNavigation(<HabitDetailLoadError message="Could not load" retryLabel="Retry" onRetry={vi.fn()} />)
    expect(mascots(tree)).toHaveLength(0)
    expect(tree.hosts().some((node) => node.props.testID === 'shell-centred-region')).toBe(false)
    expect(tree.hosts().some((node) => node.props.accessibilityLabel === 'Retry')).toBe(true)
    tree.unmount()
  })
})
