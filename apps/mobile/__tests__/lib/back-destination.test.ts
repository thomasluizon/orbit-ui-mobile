import { describe, expect, it } from 'vitest'
import { StackActions, StackRouter, TabRouter } from 'expo-router/build/react-navigation/routers'
import { getBackDestination } from '@/lib/back-destination'

const options = { routeNames: ['(tabs)', 'profile/astra', 'upgrade', 'about'], routeParamList: {}, routeGetIdList: {} }

function createStack(initialRouteName: string, next: string) {
  const router = StackRouter({ initialRouteName })
  return router.getRehydratedState(router.getStateForAction(router.getInitialState(options), StackActions.push(next), options)!, options)
}

describe('mobile back destination', () => {
  it('uses the selected tab underneath the pushed page', () => {
    const tabs = TabRouter({ initialRouteName: 'calendar' }).getInitialState({ routeNames: ['index', 'calendar', 'profile'], routeParamList: {}, routeGetIdList: {} })
    const stack = createStack('(tabs)', 'upgrade')
    stack.routes[0] = { ...stack.routes[0]!, state: tabs }
    expect(getBackDestination(stack)).toBe('/calendar')
  })

  it('uses the innermost stack that handles the pop', () => {
    const outer = createStack('(tabs)', 'about')
    outer.routes[outer.index] = { ...outer.routes[outer.index]!, state: createStack('profile/astra', 'upgrade') }
    expect(getBackDestination(outer)).toBe('/profile/astra')
  })

  it('does not use tab history as a stack pop destination', () => {
    const tabs = TabRouter({ initialRouteName: 'profile' }).getInitialState({ routeNames: ['index', 'calendar', 'profile'], routeParamList: {}, routeGetIdList: {} })
    expect(getBackDestination(tabs)).toBeUndefined()
  })

  it('uses no previous route on a direct load', () => {
    expect(getBackDestination(StackRouter({ initialRouteName: 'upgrade' }).getInitialState(options))).toBeUndefined()
    expect(getBackDestination(undefined)).toBeUndefined()
  })
})
