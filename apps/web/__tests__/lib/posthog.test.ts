import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  capture: vi.fn(),
  get_distinct_id: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
}))
const sdkImports = vi.hoisted(() => ({ count: 0, pending: null as Promise<void> | null }))

vi.mock('posthog-js', async () => {
  sdkImports.count += 1
  if (sdkImports.pending) await sdkImports.pending
  return { default: sdk }
})

describe('web PostHog adapter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    localStorage.clear()
    sdkImports.count = 0
    sdkImports.pending = null
    sdk.init.mockImplementation((_key, options) => { options.loaded?.(sdk) })
    sdk.get_distinct_id.mockReturnValue('anonymous')
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '')
  })

  it('loads the SDK only after the gate enables analytics', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    expect(sdkImports.count).toBe(0)
    await analytics.applyPostHogGate(false)
    expect(sdkImports.count).toBe(0)
    await analytics.applyPostHogGate(true)
    await analytics.applyPostHogGate(true)
    expect(sdkImports.count).toBe(1)
    expect(sdk.init).toHaveBeenCalledOnce()
  })

  it('defaults to capture, persists opt out across reload, and resumes without reload', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    expect(analytics.getAnalyticsOptOut()).toBe(false)
    expect(localStorage.getItem('analytics-opt-out')).toBeNull()
    await analytics.applyPostHogGate(true)
    await analytics.setAnalyticsOptOut(true)
    expect(localStorage.getItem('analytics-opt-out')).toBe('true')
    expect(sdk.opt_out_capturing).toHaveBeenCalledOnce()
    analytics.identifyPostHogUser('user-1')
    analytics.captureHabitLogged()
    expect(sdk.identify).not.toHaveBeenCalled()
    expect(sdk.capture).not.toHaveBeenCalled()

    vi.resetModules()
    vi.resetAllMocks()
    sdk.init.mockImplementation((_key, options) => { options.loaded?.(sdk) })
    const restarted = await import('@/lib/posthog')
    expect(restarted.getAnalyticsOptOut()).toBe(true)
    await restarted.applyPostHogGate(true)
    restarted.identifyPostHogUser('user-1')
    restarted.captureHabitLogged()
    expect(sdkImports.count).toBe(0)
    expect(sdk.init).not.toHaveBeenCalled()
    expect(sdk.identify).not.toHaveBeenCalled()
    expect(sdk.capture).not.toHaveBeenCalled()
    await restarted.setAnalyticsOptOut(false)
    expect(sdk.opt_in_capturing).toHaveBeenCalled()
    expect(localStorage.getItem('analytics-opt-out')).toBe('false')
  })

  it('resets a persisted account before the first pageview when accounts switch during loading', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'project-key')
    const previousId = '11111111-1111-4111-8111-111111111111'
    const nextId = '22222222-2222-4222-8222-222222222222'
    let persistedId = previousId
    const captured: Array<{ event: string; distinctId: string }> = []
    let acceptsEvent = (_event: string) => true
    sdk.get_distinct_id.mockImplementation(() => persistedId)
    sdk.reset.mockImplementation(() => { persistedId = 'anonymous-after-reset' })
    sdk.identify.mockImplementation((userId: string) => { persistedId = userId })
    sdk.capture.mockImplementation((event: string) => {
      if (acceptsEvent(event)) captured.push({ event, distinctId: persistedId })
    })
    sdk.init.mockImplementation((_key, options) => {
      acceptsEvent = (event) => Boolean(options.before_send({ event, properties: {} }))
      sdk.capture('$pageview')
      options.loaded?.(sdk)
      if (options.capture_pageview) sdk.capture('$pageview')
    })

    let releaseImport: (() => void) | undefined
    sdkImports.pending = new Promise<void>((resolve) => { releaseImport = resolve })
    const analytics = await import('@/lib/posthog')
    analytics.identifyPostHogUser(previousId)
    const enabling = analytics.applyPostHogGate(true)
    await Promise.resolve()
    analytics.resetPostHogUser()
    analytics.identifyPostHogUser(nextId)
    releaseImport?.()
    await enabling

    expect(sdk.reset).toHaveBeenCalledOnce()
    expect(captured.filter(({ event }) => event === '$pageview')[0]?.distinctId).toBe(nextId)
    expect(captured.map(({ distinctId }) => distinctId)).not.toContain(previousId)
  })

  it('flushes events under the current identity after loading and drops pending events when disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    analytics.identifyPostHogUser('4FB5053E-819D-4B49-9CE2-945E988469BF')
    const enabling = analytics.applyPostHogGate(true)
    analytics.captureHabitLogged()
    expect(sdk.capture).not.toHaveBeenCalled()
    await enabling
    expect(sdk.identify).toHaveBeenCalledExactlyOnceWith('4fb5053e-819d-4b49-9ce2-945e988469bf')
    expect(sdk.capture).toHaveBeenCalledExactlyOnceWith('habit_logged')
    await analytics.applyPostHogGate(false)
    analytics.captureHabitLogged()
    expect(sdk.capture).toHaveBeenCalledTimes(1)
  })

  it('does not initialize if the gate turns off during the SDK import', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    const enabling = analytics.applyPostHogGate(true)
    analytics.captureHabitLogged()
    await analytics.applyPostHogGate(false)
    await enabling
    expect(sdk.init).not.toHaveBeenCalled()
    expect(sdk.capture).not.toHaveBeenCalled()
  })

  it('keeps a late SDK loaded callback opted out', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'project-key')
    let loaded: (() => void) | undefined
    sdk.init.mockImplementation((_key, options) => {
      loaded = () => options.loaded?.(sdk)
    })
    const analytics = await import('@/lib/posthog')
    analytics.identifyPostHogUser('user-1')
    await analytics.applyPostHogGate(true)
    await analytics.setAnalyticsOptOut(true)
    sdk.identify.mockClear()
    sdk.opt_in_capturing.mockClear()
    loaded?.()
    expect(sdk.identify).not.toHaveBeenCalled()
    expect(sdk.opt_in_capturing).not.toHaveBeenCalled()
    expect(sdk.opt_out_capturing).toHaveBeenCalled()
  })

  it('does not initialize or capture without a key', async () => {
    const analytics = await import('@/lib/posthog')
    await analytics.applyPostHogGate(true)
    analytics.identifyPostHogUser('4fb5053e-819d-4b49-9ce2-945e988469bf')
    analytics.captureHabitLogged()
    expect(sdkImports.count).toBe(0)
    expect(sdk.init).not.toHaveBeenCalled()
    expect(sdk.capture).not.toHaveBeenCalled()
    expect(sdk.identify).not.toHaveBeenCalled()
  })

  it('identifies, captures one content-free event, and resets a signed-out user', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    await analytics.applyPostHogGate(true)
    analytics.identifyPostHogUser('4fb5053e-819d-4b49-9ce2-945e988469bf')
    analytics.captureHabitLogged()
    analytics.resetPostHogUser()
    expect(sdk.init).toHaveBeenCalledOnce()
    expect(sdk.init.mock.calls[0]?.[1]).toMatchObject({
      api_host: '/ingest',
      capture_performance: { web_vitals: true },
      cross_subdomain_cookie: true,
    })
    expect(sdk.identify).toHaveBeenCalledWith('4fb5053e-819d-4b49-9ce2-945e988469bf')
    expect(sdk.capture).toHaveBeenCalledExactlyOnceWith('habit_logged')
    expect(sdk.reset).toHaveBeenCalledTimes(2)
  })

  it('opts out and suppresses captures when the server flag is off', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    await analytics.applyPostHogGate(false)
    analytics.captureHabitLogged()
    expect(sdkImports.count).toBe(0)
    expect(sdk.capture).not.toHaveBeenCalled()
    await analytics.applyPostHogGate(true)
    await analytics.applyPostHogGate(false)
    expect(sdk.opt_out_capturing).toHaveBeenCalledOnce()
    await analytics.applyPostHogGate(true)
    expect(sdk.opt_in_capturing).toHaveBeenCalledTimes(2)
    expect(sdk.opt_in_capturing).toHaveBeenNthCalledWith(1, { captureEventName: false })
    expect(sdk.opt_in_capturing).toHaveBeenNthCalledWith(2, { captureEventName: false })
  })

  it('drops callback and credential URLs and removes query and fragment from URL metadata', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    await analytics.applyPostHogGate(true)
    const options = sdk.init.mock.calls[0]?.[1]
    const beforeSend = options.before_send
    const pageview = { event: '$pageview', properties: { $current_url: 'https://useorbit.org/auth-callback#access_token=secret' } }
    expect(beforeSend(pageview)).toBeNull()
    expect(beforeSend({ event: '$pageleave', properties: { $current_url: 'https://useorbit.org/today?code=secret' } })).toBeNull()
    expect(beforeSend({ event: '$pageleave', properties: { $current_url: 'https://useorbit.org/today?%63ode=secret' } })).toBeNull()
    expect(beforeSend({ event: 'habit_logged', properties: { $pathname: '/auth-callback' } })).toBeNull()
    window.history.replaceState({}, '', '/auth-callback#refresh_token=secret')
    try {
      expect(beforeSend({ event: 'habit_logged', properties: {} })).toBeNull()
    } finally {
      window.history.replaceState({}, '', '/')
    }
    const event = {
      event: '$web_vitals',
      properties: {
        $current_url: 'https://useorbit.org/today?filter=private#section',
        $pathname: '/today?filter=private#section',
        navigationURL: 'https://useorbit.org/today?filter=private#section',
      },
    }
    expect(beforeSend(event)).toMatchObject({ properties: {
      $current_url: 'https://useorbit.org/today',
      $pathname: '/today',
      navigationURL: 'https://useorbit.org/today',
    } })
  })

  it('disables DOM interaction autocapture while retaining pageview and web vitals', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'project-key')
    const analytics = await import('@/lib/posthog')
    await analytics.applyPostHogGate(true)
    expect(sdk.init.mock.calls[0]?.[1]).toMatchObject({
      autocapture: false,
      capture_pageview: true,
      capture_performance: { web_vitals: true },
    })
  })
})
