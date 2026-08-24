/**
 * Local ESLint rule: icons render at 16, 20 or 24 and nowhere between.
 *
 * DESIGN.md "Icons": the sizes are 16, 20 and 24, with 24 the default. Tabler is
 * drawn on a 24 grid, so an off-grid size such as 22 renders with fractional
 * scaling and looks soft. DESIGN.md "Enforcement" lists this as a gate.
 *
 * Only a literal `size` on an icon element is checked. A variable size is a
 * runtime value this rule cannot read, and the mark is deliberately out of scope:
 * DESIGN.md says the mark "is neither type nor an icon, so it answers to neither
 * the type scale nor the 24 icon grid".
 */

const { getAttribute, getAttributeValueNode, getElementName } = require('./_jsx-strings.cjs')

const ALLOWED = new Set([16, 20, 24])
const MARK_ELEMENTS = new Set(['OrbitMark', 'AstraGlyph', 'AstraMark', 'AppLogo'])
const ICON_NAME_RE = /^(?:Icon[A-Z]|[A-Z][A-Za-z0-9]*Icon$)/

const literalNumber = (node) => {
  if (!node) return null
  if (node.type === 'Literal' && typeof node.value === 'number') return node.value
  if (node.type === 'JSXExpressionContainer') return literalNumber(node.expression)
  return null
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Icon `size` must be 16, 20 or 24 (DESIGN.md "Icons": Tabler is drawn on a 24 grid).',
    },
    schema: [],
    messages: {
      offGridIconSize:
        'Icon size {{size}} is off the grid. DESIGN.md "Icons" allows 16, 20 and 24 only, with 24 the default: Tabler is drawn on a 24 grid, so an off-grid size renders with fractional scaling and looks soft.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = getElementName(node)
        if (!name || MARK_ELEMENTS.has(name)) return
        if (!ICON_NAME_RE.test(name)) return

        const sizeAttribute = getAttribute(node, 'size')
        if (!sizeAttribute) return

        const size = literalNumber(getAttributeValueNode(sizeAttribute))
        if (size === null || ALLOWED.has(size)) return

        context.report({ node: sizeAttribute, messageId: 'offGridIconSize', data: { size: String(size) } })
      },
    }
  },
}
