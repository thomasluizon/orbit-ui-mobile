const mediumOwners = new Set([
  'components/habits/habit-create-actions.tsx',
  'components/wrapped/wrapped-cover.tsx',
  'app/(app)/wrapped/_components/wrapped-cover.tsx',
  'app/(app)/support/_components/support-form.tsx',
  'app/(app)/support/_components/support-success-state.tsx',
  'app/support.tsx',
])

function elementName(node) {
  return node?.name?.type === 'JSXIdentifier' ? node.name.name : null
}

function countPills(node, pillNames) {
  if (!node) return 0
  if (node.type === 'JSXElement') return pillNames.has(elementName(node.openingElement)) ? 1 : 0
  if (node.type === 'JSXFragment') return node.children.reduce((sum, child) => sum + countPills(child, pillNames), 0)
  if (node.type === 'JSXExpressionContainer') return countPills(node.expression, pillNames)
  if (node.type === 'ConditionalExpression') return Math.max(countPills(node.consequent, pillNames), countPills(node.alternate, pillNames))
  if (node.type === 'LogicalExpression') return countPills(node.right, pillNames)
  if (node.type === 'ArrayExpression') return node.elements.reduce((sum, child) => sum + countPills(child, pillNames), 0)
  if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.property.name === 'map') {
    const callback = node.arguments[0]
    return callback?.type === 'ArrowFunctionExpression' && countPills(callback.body, pillNames) > 0 ? 2 : 0
  }
  return 0
}

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      row: 'Two or more pills must share an ActionRow.',
      medium: 'Use sm. Explicit md is reserved for a named flow-ending owner.',
      rowSize: 'ActionRow owns sm for every pill; md cannot appear inside it.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/')
    if (filename.includes('/__tests__/') || filename.endsWith('.test.tsx')) return {}
    const pillNames = new Set()
    const rowNames = new Set()
    return {
      ImportDeclaration(node) {
        const path = node.source.value
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue
          if (path.endsWith('/pill-button')) pillNames.add(specifier.local.name)
          if (path.endsWith('/action-row') && specifier.imported.name === 'ActionRow') rowNames.add(specifier.local.name)
        }
      },
      JSXElement(node) {
        const name = elementName(node.openingElement)
        if (rowNames.has(name)) return
        const count = node.children.reduce((sum, child) => sum + countPills(child, pillNames), 0)
        if (count >= 2) context.report({ node: node.openingElement, messageId: 'row' })
      },
      JSXOpeningElement(node) {
        if (!pillNames.has(elementName(node))) return
        const size = node.attributes.find((attribute) => attribute.type === 'JSXAttribute' && attribute.name.name === 'size')
        if (!size || size.value?.value === 'sm') return
        let ancestor = node.parent.parent
        while (ancestor) {
          if (ancestor.type === 'JSXElement' && rowNames.has(elementName(ancestor.openingElement))) {
            context.report({ node: size, messageId: 'rowSize' })
            return
          }
          ancestor = ancestor.parent
        }
        const owner = [...mediumOwners].some((path) => filename.endsWith(`/apps/web/${path}`) || filename.endsWith(`/apps/mobile/${path}`))
        if (size.value?.value !== 'md' || !owner) context.report({ node: size, messageId: 'medium' })
      },
    }
  },
}
