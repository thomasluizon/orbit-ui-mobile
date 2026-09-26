
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
