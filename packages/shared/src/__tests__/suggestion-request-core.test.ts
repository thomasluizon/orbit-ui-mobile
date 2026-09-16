import { describe, expect, it } from 'vitest'
import { createSuggestionRequestCoordinator } from '../hooks/suggestion-request-core'

describe('createSuggestionRequestCoordinator', () => {
  it('allows only one request in an active form session', () => {
    const coordinator = createSuggestionRequestCoordinator()

    expect(coordinator.begin()).toBeNull()

    coordinator.updateContext('create:habit', 'Swim')
    const request = coordinator.begin()

    expect(request).not.toBeNull()
    expect(coordinator.begin()).toBeNull()
    expect(coordinator.isCurrent(request!, 'Swim')).toBe(true)

    coordinator.finish()
    expect(coordinator.begin()).not.toBeNull()
  })

  it('keeps a request current when its session and title stay unchanged', () => {
    const coordinator = createSuggestionRequestCoordinator()
    coordinator.updateContext('edit:habit-1', 'Read')
    const request = coordinator.begin()

    coordinator.updateContext('edit:habit-1', 'Read')

    expect(coordinator.isCurrent(request!, 'Read')).toBe(true)
    expect(coordinator.isCurrent(request!, 'Write')).toBe(false)
  })

  it('invalidates a request when its title or form session changes', () => {
    const coordinator = createSuggestionRequestCoordinator()
    coordinator.updateContext('create:habit', 'Swim')
    const titleRequest = coordinator.begin()

    coordinator.updateContext('create:habit', 'Run')
    expect(coordinator.isCurrent(titleRequest!, 'Run')).toBe(false)

    coordinator.finish()
    const sessionRequest = coordinator.begin()
    coordinator.updateContext('create:sub-habit', 'Run')

    expect(coordinator.isCurrent(sessionRequest!, 'Run')).toBe(false)
  })

  it('invalidates pending work when the form session ends', () => {
    const coordinator = createSuggestionRequestCoordinator()
    coordinator.updateContext('create:habit', 'Swim')
    const request = coordinator.begin()

    coordinator.updateContext(null, '')

    expect(coordinator.isCurrent(request!, 'Swim')).toBe(false)
    coordinator.finish()
    expect(coordinator.begin()).toBeNull()
  })
})
