/**
 * Local ESLint rule: no `calc()` percentage widths for multi-column layout.
 *
 * `w-[calc(33%-1rem)]` is flexbox column math done by hand: it hardcodes the
 * column count, breaks when the gap changes, and rounds badly at most viewport
 * widths. CSS Grid expresses the same intent declaratively (`grid-cols-3 gap-4`)
 * and DESIGN.md "Bans" independently forbids escape-hatch `calc()` as a structural
 * hack.
 *
 * Scoped to WIDTH utilities and width style properties carrying a FRACTIONAL
 * percentage (< 100%) in an arithmetic expression — the column-math shape
 * specifically.
 *
 * `calc(100% - 32px)` is EXEMPT and the distinction is the whole rule: a full-width
 * element inset by fixed gutters is not column math, it is the correct way to
 * express "fill the parent minus the padding", and it has no grid equivalent. Only
 * a fraction (33%, 50%, 25%) is dividing a row into columns by hand. A `calc()`
 * mixing units for a non-layout reason (`h-[calc(100dvh-56px)]`) is likewise out of
 * scope; DESIGN.md's structural-hack ban stays reviewer-judgment for those.
 *
 * Web only: `apps/mobile` has no `calc()`.
 */

const { collectStaticStrings, collectStyleProperties, getAttribute, getAttributeValueNode, getPropertyKeyName } = require('./_jsx-strings.cjs')

const CALC_WIDTH_CLASS_RE = /(?:^|\s|:)((?:min-|max-)?w-\[calc\((.*?)\)\])/
const CALC_VALUE_RE = /calc\((.*?)\)/
const PERCENT_RE = /(\d+(?:\.\d+)?)%/g
const ARITHMETIC_RE = /[-+]/
const WIDTH_STYLE_KEYS = new Set(['width', 'minWidth', 'maxWidth', 'flexBasis'])

/** A calc() body is column math when it subtracts a gap from a FRACTION of the row. */
function isColumnMath(body) {
  if (!body || !ARITHMETIC_RE.test(body)) return false
  for (const match of body.matchAll(PERCENT_RE)) {
    if (Number(match[1]) < 100) return true
  }
  return false
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban calc() percentage widths — build multi-column layouts with CSS Grid.',
    },
    schema: [],
    messages: {
      noCalcWidth:
        '`{{token}}` is hand-rolled column math: it hardcodes the column count and breaks when the gap changes. Use CSS Grid (`grid grid-cols-3 gap-4`), which computes the track for you.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const classAttribute = getAttribute(node, 'className')
        if (classAttribute) {
          const text = collectStaticStrings(getAttributeValueNode(classAttribute)).join(' ')
          const match = CALC_WIDTH_CLASS_RE.exec(text)
          if (match && isColumnMath(match[2].replace(/_/g, ' '))) {
            context.report({ node: classAttribute, messageId: 'noCalcWidth', data: { token: match[1].replace(/_/g, ' ') } })
          }
        }

        for (const property of collectStyleProperties(node)) {
          const key = getPropertyKeyName(property)
          if (!key || !WIDTH_STYLE_KEYS.has(key)) continue
          const value = collectStaticStrings(property.value).join(' ')
          const match = CALC_VALUE_RE.exec(value)
          if (match && isColumnMath(match[1])) {
            context.report({ node: property, messageId: 'noCalcWidth', data: { token: match[0] } })
          }
        }
      },
    }
  },
}
