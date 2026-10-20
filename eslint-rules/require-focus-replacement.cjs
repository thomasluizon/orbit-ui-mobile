const { collectStaticStrings, getAttribute, getAttributeValueNode, collectStyleProperties, getPropertyKeyName } = require('./_jsx-strings.cjs')

const OUTLINE_NONE_CLASS_RE = /(?:^|\s)(?:focus:|focus-visible:)?(outline-none|outline-hidden|outline-\[none\])(?:\s|$)/
const FOCUS_REPLACEMENT_RE = /(?:^|\s)focus-visible:(?:ring|outline|border|shadow)[-[\s]/

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require a visible focus-visible replacement wherever the focus outline is removed (WCAG 2.4.7).',
    },
    schema: [],
    messages: {
      noBareOutlineNone:
        '`{{token}}` removes the focus outline with no replacement (WCAG 2.4.7). Add a `focus-visible:` ring on the same element — e.g. `focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2`.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const classAttribute = getAttribute(node, 'className')
        if (classAttribute) {
          const text = collectStaticStrings(getAttributeValueNode(classAttribute)).join(' ')
          const match = OUTLINE_NONE_CLASS_RE.exec(text)
          if (match && !FOCUS_REPLACEMENT_RE.test(text)) {
            context.report({ node: classAttribute, messageId: 'noBareOutlineNone', data: { token: match[1] } })
            return
          }
        }

        for (const property of collectStyleProperties(node)) {
          if (getPropertyKeyName(property) !== 'outline') continue
          const value = collectStaticStrings(property.value).join(' ')
          if (/\bnone\b|^0$/.test(value)) {
            context.report({ node: property, messageId: 'noBareOutlineNone', data: { token: 'outline: none' } })
          }
        }
      },
    }
  },
}
