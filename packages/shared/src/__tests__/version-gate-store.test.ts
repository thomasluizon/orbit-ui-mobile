import { expect, it } from 'vitest'
import { createVersionGateStoreState, type VersionGateStoreState } from '../stores/version-gate-store'

it('asks for an upgrade only after the API refuses the version', () => {
  let state: VersionGateStoreState = createVersionGateStoreState((update) => {
    state = { ...state, ...(typeof update === 'function' ? update(state) : update) }
  })
  expect(state).toMatchObject({ upgradeRequired: false, minVersion: null })

  state.markUpgradeRequired('2.0.0')

  expect(state).toMatchObject({ upgradeRequired: true, minVersion: '2.0.0' })
})
