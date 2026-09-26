import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { tintProposedTree, type ProposedTintDecision as TintDecision } from '@orbit/shared/utils'

export type ProposedTintElementProps = Readonly<{
  className?: unknown
  children?: ReactNode
  style?: unknown
}>

export type ProposedTintDecision = TintDecision<ReactNode>

export type ProposedTintAdapter = Readonly<{
  wrapText(child: string | number): ReactNode
  visitElement(child: ReactElement<ProposedTintElementProps>): ProposedTintDecision
}>

export function tintProposedChildren(children: ReactNode, adapter: ProposedTintAdapter): ReactNode {
  return tintProposedTree(children, {
    isText: (child) => typeof child === 'string' || typeof child === 'number',
    isElement: isValidElement,
    wrapText: (child) => adapter.wrapText(child as string | number),
    visitElement: (child) => adapter.visitElement(child as ReactElement<ProposedTintElementProps>),
    getChildren: (child) => (child as ReactElement<ProposedTintElementProps>).props.children,
    mapChildren: (nested, visit) => Children.map(nested, visit),
    withChildren: (child, nested) => cloneElement(child as ReactElement<ProposedTintElementProps>, { children: nested }),
  })
}
