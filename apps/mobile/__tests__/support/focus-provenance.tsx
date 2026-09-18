import type { ReactElement, ReactNode } from 'react'
import { FocusProvenanceView } from '@/components/ui/focus-provenance-view'

interface FocusableHost {
  findAll?: (predicate: (node: any) => boolean) => any[]
  props: {
    __nativeTag?: number
    onFocus?: () => void
  }
}

interface FocusRootHost {
  props: {
    onFocusCapture: (event: { nativeEvent: { target: number } }) => void
  }
}

/** The root layout mounts this provider around every screen, so a test that omits it drives a tree production never builds. */
export function withFocusProvenance(children: ReactNode): ReactElement {
  return <FocusProvenanceView>{children}</FocusProvenanceView>
}

export function findFocusRoot(tree: any): FocusRootHost {
  return tree.root.find((node: any) => typeof node.props.onFocusCapture === 'function')
}

/** Android reports the native view, so a caller holding the composite element resolves to the host it renders. */
function nativeTagOf(target: FocusableHost): number {
  if (typeof target.props.__nativeTag === 'number') return target.props.__nativeTag
  const [host] = target.findAll?.((node) => typeof node.props?.__nativeTag === 'number') ?? []
  if (!host) throw new Error('Expected a focus target with a native tag')
  return host.props.__nativeTag
}

/** Reproduces Android's real order: the root captures the new target first, then the host reports focus. */
export function focusHost(tree: any, target: FocusableHost): void {
  findFocusRoot(tree).props.onFocusCapture({ nativeEvent: { target: nativeTagOf(target) } })
  target.props.onFocus?.()
}
