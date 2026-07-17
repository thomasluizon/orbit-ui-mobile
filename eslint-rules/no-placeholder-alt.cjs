/**
 * Local ESLint rule: no placeholder alt text.
 *
 * `jsx-a11y/alt-text` catches the MISSING alt; it cannot judge a present-but-
 * worthless one. `alt="image"` announces "image image" to a screen reader and
 * passes every automated check. This is the custom half of that pair.
 *
 * `alt=""` is untouched — it is the correct, meaningful marker for a decorative
 * image, and reporting it would push authors toward exactly the junk values this
 * rule bans.
 */

const { getAttribute } = require('./_jsx-strings.cjs')

const IMAGE_ELEMENTS = new Set(['img', 'Image', 'NextImage'])
const PLACEHOLDER_ALT = new Set([
  'image',
  'img',
  'photo',
  'picture',
  'graphic',
  'icon',
  'logo image',
  'placeholder',
  'alt',
  'alt text',
  'screenshot',
  'thumbnail',
])

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban placeholder alt text such as alt="image" — descriptive or empty, never junk.',
    },
    schema: [],
    messages: {
      noPlaceholderAlt:
        '`alt="{{value}}"` describes nothing — a screen reader already announces the element as an image. Describe what the image conveys, or use `alt=""` if it is purely decorative.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = node.name
        const elementName = name && name.type === 'JSXIdentifier' ? name.name : null
        if (!elementName || !IMAGE_ELEMENTS.has(elementName)) return

        const altAttribute = getAttribute(node, 'alt')
        if (!altAttribute) return
        const value = altAttribute.value
        if (value == null || value.type !== 'Literal' || typeof value.value !== 'string') return

        const normalized = value.value.trim().toLowerCase()
        if (normalized === '') return
        if (PLACEHOLDER_ALT.has(normalized)) {
          context.report({ node: altAttribute, messageId: 'noPlaceholderAlt', data: { value: value.value } })
        }
      },
    }
  },
}
