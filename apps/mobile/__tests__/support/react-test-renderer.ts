export function renderedText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(renderedText).join(' ')
  if (typeof node !== 'object') return ''

  if ('children' in node) return renderedText(node.children)
  if ('props' in node && typeof node.props === 'object' && node.props !== null) {
    return renderedText((node.props as { children?: unknown }).children)
  }
  return ''
}

export function controlName(node: { props: { accessibilityLabel?: string; accessibleName?: string; children?: unknown } }): string {
  return node.props.accessibilityLabel ?? node.props.accessibleName ?? renderedText(node.props.children)
}
