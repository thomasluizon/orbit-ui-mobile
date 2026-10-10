import type { useRootNavigationState } from 'expo-router'

type NavigationState = NonNullable<ReturnType<typeof useRootNavigationState>['routes'][number]['state']>
type NavigationRoute = NavigationState['routes'][number]

function getRoutePath(route: NavigationRoute): string {
  const segments = route.name.split('/').filter((segment) => segment !== 'index' && !segment.startsWith('('))
  const child = route.state?.routes[route.state.index ?? 0]
  return [...segments, ...(child ? getRoutePath(child).split('/').filter(Boolean) : [])].join('/')
}

export function getBackDestination(state: NavigationState | undefined): string | undefined {
  if (!state) return undefined
  const index = state.index ?? 0
  const childDestination = getBackDestination(state.routes[index]?.state)
  if (childDestination) return childDestination
  const previous = state.routes[index - 1]
  if (state.type === 'stack' && previous) return `/${getRoutePath(previous)}`
  return undefined
}
