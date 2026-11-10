import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { countDehydratedBoundaries, hydrationProbeScript, type ProbedFiber } from '../../e2e/layout/hydration-guard'

const HOST_ROOT = 3
const HOST_COMPONENT = 5
const SUSPENSE_COMPONENT = 13
const ACTIVITY_COMPONENT = 31

function fiber(tag: number, memoizedState: unknown, children: ProbedFiber[] = []): ProbedFiber {
  const node: ProbedFiber = { tag, memoizedState, child: children[0] ?? null, sibling: null }
  children.forEach((child, index) => { child.sibling = children[index + 1] ?? null })
  return node
}

const suspenseState = (dehydrated: unknown) => ({ dehydrated, treeContext: null, retryLane: 536870912, hydrationErrors: null })
const rootState = (isDehydrated: boolean) => ({ element: null, isDehydrated, cache: null })

function shellWithSearchBoundary(searchBoundaryState: unknown): ProbedFiber {
  return fiber(HOST_ROOT, rootState(false), [
    fiber(HOST_COMPONENT, null, [
      fiber(HOST_COMPONENT, null),
      fiber(SUSPENSE_COMPONENT, searchBoundaryState),
    ]),
  ])
}

describe('layout hydration probe', () => {
  it('counts a dehydrated Suspense boundary under a hydrated root', () => {
    expect(countDehydratedBoundaries(shellWithSearchBoundary(suspenseState({ data: '$' })))).toBe(1)
  })

  it('counts nothing once the same boundary hydrates or shows a client fallback', () => {
    expect(countDehydratedBoundaries(shellWithSearchBoundary(null))).toBe(0)
    expect(countDehydratedBoundaries(shellWithSearchBoundary(suspenseState(null)))).toBe(0)
  })

  it('counts a dehydrated root and a dehydrated Activity boundary', () => {
    expect(countDehydratedBoundaries(fiber(HOST_ROOT, rootState(true)))).toBe(1)
    expect(countDehydratedBoundaries(fiber(HOST_ROOT, rootState(false), [
      fiber(ACTIVITY_COMPONENT, suspenseState({ data: '&' })),
      fiber(ACTIVITY_COMPONENT, { baseLanes: 0, cachePool: null }),
    ]))).toBe(1)
  })

  it('marks the page hydrated from the serialized script on the first commit with no dehydrated boundary', () => {
    const script = `
      globalThis.window = globalThis;
      ${hydrationProbeScript};
      const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__
      const observed = { reactInjects: !hook.isDisabled && hook.supportsFiber === true }
      const rendererId = hook.inject({ rendererPackageName: 'react-dom' })
      hook.onCommitFiberRoot(rendererId, { current: ${JSON.stringify(shellWithSearchBoundary(suspenseState({ data: '$' })))} }, undefined, false)
      observed.afterDehydratedCommit = window.__orbitLayoutFullyHydrated ?? null
      hook.onCommitFiberRoot(rendererId, { current: ${JSON.stringify(shellWithSearchBoundary(null))} }, undefined, false)
      observed.afterHydratedCommit = window.__orbitLayoutFullyHydrated ?? null
      process.stdout.write(JSON.stringify(observed))
    `
    const output = execFileSync(process.execPath, ['--eval', script], { encoding: 'utf8', timeout: 10_000 })
    expect(JSON.parse(output)).toEqual({
      reactInjects: true,
      afterDehydratedCommit: null,
      afterHydratedCommit: true,
    })
  })
})
