import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react'

export type ProposedTintElementProps = Readonly<{
  className?: unknown
  children?: ReactNode
  style?: unknown
}>

export type ProposedTintDecision =
  | Readonly<{ kind: 'keep' }>
  | Readonly<{ kind: 'recurse' }>
  | Readonly<{ kind: 'replace'; child: ReactNode }>

export type ProposedTintAdapter = Readonly<{
  wrapText(child: string | number): ReactNode
  visitElement(child: ReactElement<ProposedTintElementProps>): ProposedTintDecision
}>

function tintProposedChild(child: ReactNode, adapter: ProposedTintAdapter): ReactNode {
  if (typeof child === 'string' || typeof child === 'number') return adapter.wrapText(child)
  if (!isValidElement<ProposedTintElementProps>(child)) return child

  const decision = adapter.visitElement(child)
  if (decision.kind === 'keep') return child
  if (decision.kind === 'replace') return decision.child

  const children = Children.map(child.props.children, (nestedChild) =>
    tintProposedChild(nestedChild, adapter))
  return cloneElement(child, { children })
}

export function tintProposedChildren(children: ReactNode, adapter: ProposedTintAdapter): ReactNode {
  return Children.map(children, (child) => tintProposedChild(child, adapter))
}
