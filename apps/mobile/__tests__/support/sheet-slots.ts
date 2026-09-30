interface SlotNode {
  type: unknown
  props: Record<string, unknown>
  children?: unknown[]
  findAll(predicate: (node: SlotNode) => boolean): SlotNode[]
}

function textOf(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (!node || typeof node !== 'object' || !('children' in node)) return ''
  return ((node as { children?: unknown[] }).children ?? []).map(textOf).join('')
}

function isButton(node: SlotNode): boolean {
  if (typeof node.type !== 'string') return false
  return node.props.accessibilityRole === 'button' || node.type.startsWith('PillButton')
}

/**
 * Names every button the sheet double renders in one slot, in order: the body scrolls,
 * the actions slot is the pinned footer. A button's name is its label, else its text.
 * A test that stubs `PillButton` as a `PillButton*` host still counts it as a button.
 */
export function sheetSlotButtons(root: unknown, slot: 'SheetBody' | 'SheetActions'): string[] {
  const container = (root as SlotNode).findAll((node) => node.type === slot)[0]
  if (!container) throw new Error(`Expected the ${slot} slot`)
  return container
    .findAll(isButton)
    .map((node) => (typeof node.props.accessibilityLabel === 'string' ? node.props.accessibilityLabel : textOf(node)))
}

/** Whether the footer groups its actions in `DialogActionPair`. */
export function sheetActionsUseActionPair(root: unknown): boolean {
  const container = (root as SlotNode).findAll((node) => node.type === 'SheetActions')[0]
  if (!container) throw new Error('Expected the SheetActions slot')
  return container.findAll((node) => typeof node.type === 'string' && node.props.testID === 'dialog-action-pair').length === 1
}
