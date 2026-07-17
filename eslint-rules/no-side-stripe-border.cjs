/**
 * Local ESLint rule: no coloured side-stripe.
 *
 * DESIGN.md "Bans": never a `border-left` / `border-right` thicker than 1px as an
 * accent stripe on a card, row, callout, or alert. Use a full inset hairline ring,
 * a background tint, or a leading glyph.
 *
 * The thickness AND the colour must co-occur on the same element — a bare
 * `border-l-4` with no colour is (a) invisible and (b) not the AI-slop artifact
 * this bans, so it is not reported. A 1px side border is explicitly fine: that is
 * a hairline, which the kit uses.
 *
 * Mobile is covered via the style-object branch (`borderLeftWidth: 4` +
 * `borderLeftColor`), per the DESIGN.md Enforcement table.
 */

const { collectStaticStrings, collectStyleProperties, getAttribute, getAttributeValueNode, getPropertyKeyName } = require('./_jsx-strings.cjs')

const STRIPE_WIDTH_CLASS_RE = /(?:^|\s|:)border-([lr])-(\d+)(?:\s|$)/g
const STRIPE_ARBITRARY_CLASS_RE = /(?:^|\s|:)border-([lr])-\[(\d+(?:\.\d+)?)px\](?:\s|$)/g
const SIDE_COLOR_CLASS_RE = /(?:^|\s|:)border-[lr]-(?!\d+(?:\s|$))(?!\[\d)[a-z[]/
const GENERIC_BORDER_COLOR_CLASS_RE = /(?:^|\s|:)border-(?:\[[^\]]+\]|(?:[a-z]+-\d{2,3}))(?:\s|$)/

const WIDTH_STYLE_KEYS = { borderLeftWidth: 'borderLeftColor', borderRightWidth: 'borderRightColor' }

function findStripeClass(text) {
  const matches = [
    ...text.matchAll(STRIPE_WIDTH_CLASS_RE),
    ...text.matchAll(STRIPE_ARBITRARY_CLASS_RE),
  ]
  for (const match of matches) {
    if (Number(match[2]) > 1) return match[0].trim()
  }
  return null
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban coloured side-stripe borders thicker than 1px (DESIGN.md "Bans").',
    },
    schema: [],
    messages: {
      noSideStripe:
        'A coloured side-stripe (`{{token}}`) is banned (DESIGN.md "Bans": never a border-left/right thicker than 1px as an accent stripe). Use a full inset hairline ring, a background tint, or a leading glyph.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const classAttribute = getAttribute(node, 'className')
        if (classAttribute) {
          const text = collectStaticStrings(getAttributeValueNode(classAttribute)).join(' ')
          const stripe = findStripeClass(text)
          if (stripe && (SIDE_COLOR_CLASS_RE.test(text) || GENERIC_BORDER_COLOR_CLASS_RE.test(text))) {
            context.report({ node: classAttribute, messageId: 'noSideStripe', data: { token: stripe } })
          }
        }

        const properties = collectStyleProperties(node)
        if (properties.length === 0) return
        const byKey = new Map()
        for (const property of properties) {
          const key = getPropertyKeyName(property)
          if (key) byKey.set(key, property)
        }
        for (const [widthKey, colorKey] of Object.entries(WIDTH_STYLE_KEYS)) {
          const widthProperty = byKey.get(widthKey)
          if (!widthProperty) continue
          const widthValue = widthProperty.value
          if (widthValue.type !== 'Literal' || typeof widthValue.value !== 'number') continue
          if (widthValue.value <= 1) continue
          if (!byKey.has(colorKey) && !byKey.has('borderColor')) continue
          context.report({ node: widthProperty, messageId: 'noSideStripe', data: { token: widthKey } })
        }
      },
    }
  },
}
