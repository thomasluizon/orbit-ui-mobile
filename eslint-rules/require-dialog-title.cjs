
const { getElementName } = require('./_jsx-strings.cjs')

const CONTENT_TO_TITLE = new Map([
  ['DialogContent', 'DialogTitle'],
  ['AlertDialogContent', 'AlertDialogTitle'],
  ['SheetContent', 'SheetTitle'],
  ['DrawerContent', 'DrawerTitle'],
])

function hasTitleDescendant(node, titleName) {
  let found = false
  const walk = (current) => {
    if (found || current == null || typeof current !== 'object') return
    if (Array.isArray(current)) {
      for (const item of current) walk(item)
      return
    }
    if (current.type === 'JSXElement') {
      const name = getElementName(current.openingElement)
      if (name === titleName || (name && name.endsWith(titleName))) {
        found = true
        return
      }
    }
    for (const key of ['children', 'expression', 'consequent', 'alternate', 'left', 'right', 'body', 'argument']) {
      if (current[key]) walk(current[key])
    }
  }
  walk(node.children)
  return found
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require a Title component inside every Dialog / Sheet / Drawer content subtree (accessible name).',
    },
    schema: [],
    messages: {
      missingTitle:
        '<{{content}}> has no <{{title}}> — the overlay opens with no accessible name. Add <{{title}}>, using `className="sr-only"` if the design shows no visible heading.',
    },
  },
  create(context) {
    return {
      JSXElement(node) {
        const contentName = getElementName(node.openingElement)
        if (!contentName) return
        const titleName = CONTENT_TO_TITLE.get(contentName)
        if (!titleName) return
        if (node.children.length === 0) return
        if (hasTitleDescendant(node, titleName)) return
        context.report({
          node: node.openingElement,
          messageId: 'missingTitle',
          data: { content: contentName, title: titleName },
        })
      },
    }
  },
}
