/**
 * Local ESLint rule: no arbitrary / raw high z-index (the stacking arms race).
 *
 * DESIGN.md "### Stacking": overlays stack on the semantic six-tier scale
 * (`dropdown < sticky < modalBackdrop < modal < toast < tooltip`, plus the
 * `celebration` and `tourSpotlight` carve-outs), exposed as Tailwind `z-<tier>`
 * utilities on web (from the `--z-index-*` theme tokens) and as `zLayers.<tier>`
 * on mobile. The `9999` / `10003` "add until it works" literals this bans are
 * exactly what that scale replaced — a raw high z-index is a collision worked
 * around, not a decision.
 *
 * Two vectors, both at the arms-race threshold (>= 10 — above every legitimate
 * local sibling-stacking value in the codebase, which top out at `z-[5]` /
 * `zIndex: 2`, and far below the 1000-1700 scale):
 *  - a Tailwind arbitrary `z-[<n>]` className with n >= 10;
 *  - a raw numeric `zIndex: <n>` style property (JSX inline, `StyleSheet.create`,
 *    or a style variable) with n >= 10.
 *
 * DELIBERATELY ALLOWED (not the arms race, and with no tier on a six-tier OVERLAY
 * scale to receive them): small local sibling stacking — `z-[1..9]`, the standard
 * Tailwind `z-0..z-50` utilities, and `zIndex: 1..9` (lifting content above a
 * `::before`, ordering a sticky table header). Also allowed: `zLayers.<tier>`
 * member refs, the `z-<tier>` utilities, and Android shadow `elevation` (a shadow
 * depth, orthogonal to stacking). Banning those would false-fire ~50 correct
 * sites and, per bundle 9, they cannot be suppressed — so the line is the
 * arms-race threshold, not "any z".
 *
 * SCOPE LIMIT: raw `z-index` in `app/globals.css` is invisible to ESLint (TS/TSX
 * only), same as the sibling `local/*` gates.
 */

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
