import React from 'react'
import { expect, it } from 'vitest'
import { useTurnstileToken } from '../hooks/use-turnstile-token'

const TestRenderer = require('react-test-renderer')

it('consumes each token once, resets the widget, and clears a token when offline', async () => {
  const holder: { current: ReturnType<typeof useTurnstileToken> | null } = { current: null }
  function Probe({ isOnline }: Readonly<{ isOnline: boolean }>) {
    holder.current = useTurnstileToken('site-key', isOnline)
    return null
  }

  let renderer: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(React.createElement(Probe, { isOnline: true }))
    await Promise.resolve()
  })
  expect(holder.current!.takeToken()).toBeNull()

  await TestRenderer.act(async () => {
    holder.current!.onToken('first-token')
    await Promise.resolve()
  })
  expect(holder.current!.token).toBe('first-token')
  await TestRenderer.act(async () => {
    expect(holder.current!.takeToken()).toEqual({ turnstileToken: 'first-token' })
    await Promise.resolve()
  })
  expect(holder.current!.token).toBeNull()
  expect(holder.current!.resetKey).toBe(1)
  expect(holder.current!.takeToken()).toBeNull()

  await TestRenderer.act(async () => {
    holder.current!.onToken('second-token')
    renderer!.update(React.createElement(Probe, { isOnline: false }))
    await Promise.resolve()
  })
  expect(holder.current!.token).toBeNull()
  expect(holder.current!.takeToken()).toBeNull()
})

it('omits the token field when no site key is configured', async () => {
  let current: ReturnType<typeof useTurnstileToken> | null = null
  function Probe() {
    current = useTurnstileToken(undefined, true)
    return null
  }
  await TestRenderer.act(async () => {
    TestRenderer.create(React.createElement(Probe))
    await Promise.resolve()
  })
  expect(current!.takeToken()).toEqual({})
})
