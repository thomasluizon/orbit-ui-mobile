
const { collectStaticStrings, getAttribute, getAttributeValueNode } = require('./_jsx-strings.cjs')

const SPACE_CLASS_RE = /(?:^|\s|:)(space-[xy]-(?:\d+|px|\[[^\]]+\]))(?:\s|$)/

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban `space-x-*` / `space-y-*` utilities in favour of a `gap-*` container (DESIGN.md "Bans").',
    },
    schema: [],
    messages: {
      noSpaceUtility:
        '`{{token}}` spaces siblings with margins (DESIGN.md "Bans": no `space-x-*` / `space-y-*`). Make this a flex or grid container and use `gap-*`.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const classAttribute = getAttribute(node, 'className')
        if (!classAttribute) return
        const text = collectStaticStrings(getAttributeValueNode(classAttribute)).join(' ')
        const match = SPACE_CLASS_RE.exec(text)
        if (match) {
          context.report({ node: classAttribute, messageId: 'noSpaceUtility', data: { token: match[1] } })
        }
      },
    }
  },
}
