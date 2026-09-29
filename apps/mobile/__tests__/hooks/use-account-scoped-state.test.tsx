import React from 'react'
import { describe, expect, it } from 'vitest'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { useAccountBoundRouteRequest, useAccountScopedState } from '@/hooks/use-session-reset'

const TestRenderer = require('react-test-renderer')

describe('useAccountScopedState', () => {
  it('hides old account state immediately and ignores its delayed setter', () => {
    let currentValue = ''
    let setAccountValue: (value: string) => void = () => {}

    function Probe() {
      const [value, setValue] = useAccountScopedState('')
      currentValue = value
      setAccountValue = setValue
      return React.createElement('Text', null, value)
    }

    TestRenderer.act(() => {
      TestRenderer.create(React.createElement(Probe))
    })
    const oldSetter = setAccountValue
    TestRenderer.act(() => oldSetter('Private import result'))
    expect(currentValue).toBe('Private import result')

    TestRenderer.act(() => advanceAccountGeneration())
    expect(currentValue).toBe('')

    TestRenderer.act(() => oldSetter('Delayed old result'))
    expect(currentValue).toBe('')
  })

  it('does not reopen an old route request after an account replacement', () => {
    let requestKey = 'review'
    let routeRequestAllowed = false

    function Probe() {
      routeRequestAllowed = useAccountBoundRouteRequest(requestKey)
      return React.createElement('Text', null)
    }

    let tree: { update: (element: React.ReactElement) => void }
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(Probe))
    })
    expect(routeRequestAllowed).toBe(true)

    TestRenderer.act(() => advanceAccountGeneration())
    expect(routeRequestAllowed).toBe(false)

    TestRenderer.act(() => {
      requestKey = ''
      tree!.update(React.createElement(Probe))
    })
    TestRenderer.act(() => {
      requestKey = 'review'
      tree!.update(React.createElement(Probe))
    })
    expect(routeRequestAllowed).toBe(true)
  })
})
