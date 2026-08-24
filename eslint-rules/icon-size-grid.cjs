/**
 * Local ESLint rule: icons render at 16, 20 or 24 and nowhere between.
 *
 * DESIGN.md "Icons": the sizes are 16, 20 and 24, with 24 the default. Tabler is
 * drawn on a 24 grid, so an off-grid size such as 22 renders with fractional
 * scaling and looks soft. DESIGN.md "Enforcement" lists this as a gate.
 *
 * An icon is identified by its IMPORT, not by its name. The barrel re-exports
 * Tabler under the names the call sites already use - `Check`, `Trash2`,
 * `Receipt` - so a name-shape heuristic would miss almost every real icon. Every
 * icon reaches a call site through `@/components/ui/icons` and nothing else
 * (`no-restricted-imports` guarantees it), so that import IS the icon set.
 *
 * The marks are deliberately out of scope even when imported from the barrel:
 * DESIGN.md says the mark "is neither type nor an icon, so it answers to neither
 * the type scale nor the 24 icon grid".
 */

const { getAttribute, getAttributeValueNode, getElementName } = require('./_jsx-strings.cjs')

const ALLOWED = new Set([16, 20, 24])
const ICON_BARREL = /(?:^|\/)components\/ui\/icons$/
const MARKS = new Set(['OrbitMark', 'AstraGlyph', 'AstraMark', 'AppLogo'])

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
    const iconNames = new Set()

    return {
      ImportDeclaration(node) {
        if (!ICON_BARREL.test(String(node.source.value))) return
        for (const specifier of node.specifiers) {
          const local = specifier.local?.name
          if (local && !MARKS.has(local)) iconNames.add(local)
        }
      },
      'Program:exit'() {
        // names are collected before any JSX is visited, because imports hoist
      },
      JSXOpeningElement(node) {
        const name = getElementName(node)
        if (!name || !iconNames.has(name)) return

        const sizeAttribute = getAttribute(node, 'size')
        if (!sizeAttribute) return

        const size = literalNumber(getAttributeValueNode(sizeAttribute))
        if (size === null || ALLOWED.has(size)) return

        context.report({ node: sizeAttribute, messageId: 'offGridIconSize', data: { size: String(size) } })
      },
    }
  },
}
