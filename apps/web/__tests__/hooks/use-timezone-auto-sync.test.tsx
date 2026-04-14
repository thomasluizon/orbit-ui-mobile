import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => {
  const state = {
    profile: null as unknown as Profile,
  }

  const queryClient = {
    getQueryData: vi.fn(() => state.profile),
    setQueryData: vi.fn((
      _queryKey: readonly unknown[],
      updater: Profile | ((old: Profile | undefined) => Profile | undefined),
    ) => {
      state.profile = typeof updater === 'function'
        ? updater(state.profile) ?? state.profile
        : updater
    }),
  }

  return {
    state,
    queryClient,
    useQueryClient: vi.fn(() => queryClient),
    updateTimezone: vi.fn(async () => undefined),
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: mocks.useQueryClient,
}))

vi.mock('@/app/actions/profile', () => ({
  updateTimezone: mocks.updateTimezone,
}))

import { useTimezoneAutoSync } from '@/hooks/use-timezone-auto-sync'

let detectedTimeZone = 'UTC'

function Harness({ profile }: Readonly<{ profile: Profile | undefined }>) {
  useTimezoneAutoSync(profile)
  return null
}

async function renderHookHarness(profile: Profile | undefined) {
  let renderer: InstanceType<typeof TestRenderer.create> | null = null

  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(<Harness profile={profile} />)
    await Promise.resolve()
  })

  return renderer
}

describe('web useTimezoneAutoSync', () => {
  beforeEach(() => {
    detectedTimeZone = 'UTC'
    mocks.state.profile = createMockProfile()
    mocks.queryClient.getQueryData.mockClear()
    mocks.queryClient.setQueryData.mockClear()
    mocks.useQueryClient.mockClear()
    mocks.updateTimezone.mockClear()

    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
      () =>
        ({
          resolvedOptions: () => ({ timeZone: detectedTimeZone }),
        }) as Intl.DateTimeFormat,
    )
  })

  it('updates the cached profile when the detected timezone changes on mount', async () => {
    mocks.state.profile = createMockProfile({ timeZone: 'UTC' })
    detectedTimeZone = 'America/Sao_Paulo'

    const renderer = await renderHookHarness(mocks.state.profile)

    expect(mocks.updateTimezone).toHaveBeenCalledWith({ timeZone: 'America/Sao_Paulo' })
    expect(mocks.queryClient.setQueryData).toHaveBeenCalledWith(
      profileKeys.detail(),
      expect.any(Function),
    )
    expect(mocks.state.profile.timeZone).toBe('America/Sao_Paulo')

    await TestRenderer.act(async () => {
      renderer?.unmount()
    })
  })

  it('does not update when the timezone is unchanged or still UTC', async () => {
    mocks.state.profile = createMockProfile({ timeZone: 'Europe/London' })
    detectedTimeZone = 'Europe/London'

    const renderer = await renderHookHarness(mocks.state.profile)
    expect(mocks.updateTimezone).not.toHaveBeenCalled()

    detectedTimeZone = 'UTC'
    await TestRenderer.act(async () => {
      globalThis.window.dispatchEvent(new Event('focus'))
      await Promise.resolve()
    })
    expect(mocks.updateTimezone).not.toHaveBeenCalled()

    await TestRenderer.act(async () => {
      renderer?.unmount()
    })
  })

  it('syncs again when the browser regains focus in a new timezone', async () => {
    mocks.state.profile = createMockProfile({ timeZone: 'Europe/London' })
    detectedTimeZone = 'Europe/London'

    const renderer = await renderHookHarness(mocks.state.profile)
    expect(mocks.updateTimezone).not.toHaveBeenCalled()

    detectedTimeZone = 'America/New_York'
    await TestRenderer.act(async () => {
      globalThis.window.dispatchEvent(new Event('focus'))
      await Promise.resolve()
    })

    expect(mocks.updateTimezone).toHaveBeenCalledWith({ timeZone: 'America/New_York' })
    expect(mocks.state.profile.timeZone).toBe('America/New_York')

    await TestRenderer.act(async () => {
      renderer?.unmount()
    })
  })
})
