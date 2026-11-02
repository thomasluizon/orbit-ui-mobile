import { createInitialState } from 'expo-router/build/react-navigation/core/createInitialState'
import { createRouteKeyMinter } from 'expo-router/build/react-navigation/routers/stateKeys'
import { StackRouter } from 'expo-router/build/react-navigation/routers/StackRouter'
import { TabRouter } from 'expo-router/build/react-navigation/routers/TabRouter'
import { isActionHandled } from 'expo-router/build/react-navigation/routers/utils'
import type { NavigationAction, NavigationState, PartialState, Router, RouterConfigOptions } from 'expo-router/build/react-navigation/routers/types'

function navigationFixture<State extends NavigationState, Action extends NavigationAction>(router: Router<State, Action>, initialRouteName?: string) {
  function getInitialState(options: RouterConfigOptions) {
    return createInitialState<State>({ ...options, initialRouteName, parentChain: 'root' })
  }
  function getRehydratedState(state: PartialState<State> | State, options: RouterConfigOptions): State {
    const initial = getInitialState(options)
    const minter = createRouteKeyMinter(initial)
    const routes = state.routes.map(route => ({ ...route, key: route.key ?? minter.mint(route.name) }))
    const complete = {
      ...initial, ...state, routes, stale: false as const, type: router.type,
      routeNames: options.routeNames, index: state.index ?? routes.length - 1,
      routeKeySeq: state.routeKeySeq ?? minter.routeKeySeq,
    } as State
    return router.normalizeState ? router.normalizeState(complete) : complete
  }
  function getStateForAction(state: State, action: Action, options: RouterConfigOptions) {
    const result = router.getStateForAction(state, action, options)
    return isActionHandled(result) ? result.state : null
  }
  return {
    getInitialState: (options: RouterConfigOptions) => getRehydratedState(getInitialState(options), options),
    getRehydratedState,
    getStateForAction,
    getStateForRouteNamesChange: (state: State, options: RouterConfigOptions) => {
      const next = getStateForAction(state, { type: 'ROUTE_NAMES_CHANGED', payload: { routeNames: options.routeNames } } as Action, options)
      if (!next) throw new Error('Declared navigation routes were rejected')
      return next
    },
  }
}

export function stackFixture(options: Parameters<typeof StackRouter>[0]) {
  return navigationFixture(StackRouter(options), options.initialRouteName)
}

export function tabFixture(options: Parameters<typeof TabRouter>[0]) {
  return navigationFixture(TabRouter(options), options.initialRouteName)
}
