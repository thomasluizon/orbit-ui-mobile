import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { HabitDetailLoadError } from '@/components/habits/habit-detail-load-error'
import { press, renderNavigation } from '../ui/navigation-render'

const texts = (tree: ReturnType<typeof renderNavigation>) => tree.hosts().flatMap((node) => (typeof node.props.children === 'string' ? [node.props.children] : []))
const mascots = (tree: ReturnType<typeof renderNavigation>) => tree.hosts().filter((node) => (node.props as Record<string, unknown>)['data-orbit-state'] !== undefined)

describe('Android habit detail load error', () => {
  it('shows Orbit in Parado above the message and the retry, in the centred region', () => {
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

  it('says the read needs a connection, with Orbit in Parado and the retry, when the read failed offline', () => {
    const tree = renderNavigation(<HabitDetailLoadError message="Could not load" offlineMessage="Check your connection" error={new TypeError('Network request failed')} retryLabel="Retry" onRetry={vi.fn()} />)
    expect(texts(tree)).toContain('Check your connection')
    expect(texts(tree)).not.toContain('Could not load')
    expect((mascots(tree)[0]!.props as Record<string, unknown>)['data-orbit-state']).toBe('parado')
    expect(tree.hosts().some((node) => node.props.accessibilityLabel === 'Retry')).toBe(true)
    tree.unmount()
  })

  it('keeps the load message for a server failure and for the flag off, even offline', () => {
    const server = Object.assign(new Error('Server error'), { status: 500 })
    const guided = renderNavigation(<HabitDetailLoadError message="Could not load" offlineMessage="Check your connection" error={server} retryLabel="Retry" onRetry={vi.fn()} />)
    expect(texts(guided)).toContain('Could not load')
    guided.unmount()
    const current = renderNavigation(<HabitDetailLoadError message="Could not load" offlineMessage="Check your connection" error={new TypeError('Network request failed')} retryLabel="Retry" onRetry={vi.fn()} />)
    expect(texts(current)).toContain('Could not load')
    current.unmount()
  })

  it('renders the current full-surface error, with its Orbit in Parado, with the flag off', () => {
    const tree = renderNavigation(<HabitDetailLoadError message="Could not load" retryLabel="Retry" onRetry={vi.fn()} />)
    expect(mascots(tree).map((node) => (node.props as Record<string, unknown>)['data-orbit-state'])).toEqual(['parado'])
    expect(tree.hosts().some((node) => node.props.testID === 'shell-centred-region')).toBe(true)
    expect(tree.hosts().some((node) => node.props.testID === 'habit-detail-load-error')).toBe(false)
    expect(tree.hosts().some((node) => node.props.accessibilityLabel === 'Retry')).toBe(true)
    tree.unmount()
  })
})
