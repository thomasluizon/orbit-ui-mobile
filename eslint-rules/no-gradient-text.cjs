/**
 * Local ESLint rule: no gradient text.
 *
 * DESIGN.md "Bans": no gradient text (`bg-clip-text` over a gradient). Emphasis
 * comes from weight or size on one solid colour.
 *
 * Reported only when BOTH halves co-occur on the same element: a text clip
 * (`bg-clip-text` / `background-clip: text`) AND a gradient background. The
 * pairing matters — `bg-clip-text` over a solid colour is inert, and a gradient
 * without a text clip is `local/no-raw-gradient`'s business, not this rule's.
 */

const { collectStaticStrings, collectStyleProperties, getAttribute, getAttributeValueNode, getPropertyKeyName } = require('./_jsx-strings.cjs')

const CLIP_TEXT_CLASS_RE = /(?:^|\s|:)(?:bg-clip-text|\[background-clip:text\])(?:\s|$)/
const GRADIENT_RE = /(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(|(?:^|\s|:)(?:bg-gradient-to-[trbl]{1,2}|bg-linear-)/
const CLIP_STYLE_KEYS = new Set(['backgroundClip', 'WebkitBackgroundClip'])
const BACKGROUND_STYLE_KEYS = new Set(['background', 'backgroundImage'])

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban gradient text (DESIGN.md "Bans": no `bg-clip-text` over a gradient).',
    },
    schema: [],
    messages: {
      noGradientText:
        'Gradient text is banned (DESIGN.md "Bans"). Emphasis comes from weight or size on one solid colour — drop the gradient and the text clip.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const classAttribute = getAttribute(node, 'className')
        const classText = classAttribute
          ? collectStaticStrings(getAttributeValueNode(classAttribute)).join(' ')
          : ''

        let hasClip = CLIP_TEXT_CLASS_RE.test(classText)
        let hasGradient = GRADIENT_RE.test(classText)

        for (const property of collectStyleProperties(node)) {
          const key = getPropertyKeyName(property)
          if (!key) continue
          const value = collectStaticStrings(property.value).join(' ')
          if (CLIP_STYLE_KEYS.has(key) && /\btext\b/.test(value)) hasClip = true
          if (BACKGROUND_STYLE_KEYS.has(key) && GRADIENT_RE.test(value)) hasGradient = true
        }

        if (hasClip && hasGradient) {
          context.report({ node: classAttribute ?? node, messageId: 'noGradientText' })
        }
      },
    }
  },
}
