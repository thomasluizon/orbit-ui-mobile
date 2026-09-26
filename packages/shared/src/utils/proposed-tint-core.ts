export type ProposedTintDecision<Node> =
  | Readonly<{ kind: 'keep' }>
  | Readonly<{ kind: 'recurse' }>
  | Readonly<{ kind: 'replace'; child: Node }>

export interface ProposedTintTreeAdapter<Node> {
  isText(child: Node): boolean
  isElement(child: Node): boolean
  wrapText(child: Node): Node
  visitElement(child: Node): ProposedTintDecision<Node>
  getChildren(child: Node): Node
  mapChildren(children: Node, visit: (child: Node) => Node): Node
  withChildren(child: Node, children: Node): Node
}

export function tintProposedTree<Node>(children: Node, adapter: ProposedTintTreeAdapter<Node>): Node {
  function tintChild(child: Node): Node {
    if (adapter.isText(child)) return adapter.wrapText(child)
    if (!adapter.isElement(child)) return child

    const decision = adapter.visitElement(child)
    if (decision.kind === 'keep') return child
    if (decision.kind === 'replace') return decision.child

    const nested = adapter.mapChildren(adapter.getChildren(child), tintChild)
    return adapter.withChildren(child, nested)
  }

  return adapter.mapChildren(children, tintChild)
}
