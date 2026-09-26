
const { getClassText, getPropertyKeyName } = require('./_jsx-strings.cjs')

const ARMS_RACE_FLOOR = 10
const ARBITRARY_Z_RE = /(?:^|\s|:)z-\[(\d+)\]/g

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban arbitrary / raw high z-index; overlays use the semantic stacking scale (DESIGN.md "### Stacking").',
    },
    schema: [],
    messages: {
      arbitraryClass:
        'Arbitrary `z-[{{value}}]` restarts the stacking arms race (DESIGN.md "### Stacking"). Overlays use the semantic scale (`z-modal`, `z-toast`, … from `--z-index-*`); a small `z-[1..9]` or a standard `z-{n}` utility is fine for local sibling stacking.',
      rawZIndex:
        'Raw `zIndex: {{value}}` restarts the stacking arms race (DESIGN.md "### Stacking"). Use `zLayers.<tier>` (mobile) / a `z-<tier>` utility (web) for overlays; a small `zIndex` (1–9) is fine for local sibling stacking.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const text = getClassText(node)
        if (!text) return
        ARBITRARY_Z_RE.lastIndex = 0
        let match
        while ((match = ARBITRARY_Z_RE.exec(text)) !== null) {
          if (Number(match[1]) >= ARMS_RACE_FLOOR) {
            context.report({ node, messageId: 'arbitraryClass', data: { value: match[1] } })
          }
        }
      },
      Property(node) {
        if (getPropertyKeyName(node) !== 'zIndex') return
        const value = node.value
        if (value.type === 'Literal' && typeof value.value === 'number' && value.value >= ARMS_RACE_FLOOR) {
          context.report({ node, messageId: 'rawZIndex', data: { value: value.value } })
        }
      },
    }
  },
}
