import { beforeEach, describe, expect, it } from 'vitest'
import { useVersionGateStore } from '@/stores/version-gate-store'

describe('web version gate store', () => {
  beforeEach(() => {
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
  })

  it('retains the shared upgrade signal alongside web reload guidance', () => {
    const store = useVersionGateStore.getState()

    expect(store.upgradeRequired).toBe(false)
    expect(store.minVersion).toBeNull()
    expect(store.reloadReason).toBeNull()

    store.markUpgradeRequired('1.5.0')
    store.requireReload('accountChanged')

    expect(useVersionGateStore.getState()).toMatchObject({
      upgradeRequired: true,
      minVersion: '1.5.0',
      reloadReason: 'accountChanged',
    })
  })
})
