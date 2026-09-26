
const { getAttribute, getAttributeValueNode, getPropertyKeyName, collectStyleProperties } = require('./_jsx-strings.cjs')

const WILL_CHANGE_CLASS_RE = /(?:^|\s|:)(will-change-(?:[a-z-]+|\[[^\]]+\]))(?:\s|$)/
const WILL_CHANGE_ALL_RE = /will-change-\[?all\]?|will-change\s*:\s*all/

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban `will-change: all` and static `will-change` declarations — a permanent compositor layer.',
    },
    schema: [],
    messages: {
      noWillChangeAll:
        '`will-change: all` promotes a compositor layer against every property at once. Name the exact property that animates, and only while it is about to.',
      noStaticWillChange:
        '`{{token}}` in a static class holds a compositor layer for this element\'s entire life, whether or not the animation ever runs. Apply `will-change` conditionally — only while the animation is imminent or running — and drop it when it ends.',
    },
  },
  create(context) {
    function isStatic(valueNode) {
      return valueNode != null && valueNode.type === 'Literal'
    }

    return {
      JSXOpeningElement(node) {
        const classAttribute = getAttribute(node, 'className')
        if (classAttribute) {
          const valueNode = getAttributeValueNode(classAttribute)
          const text = valueNode && valueNode.type === 'Literal' && typeof valueNode.value === 'string' ? valueNode.value : ''
          if (WILL_CHANGE_ALL_RE.test(text)) {
            context.report({ node: classAttribute, messageId: 'noWillChangeAll' })
          } else {
            const match = WILL_CHANGE_CLASS_RE.exec(text)
            if (match && isStatic(valueNode)) {
              context.report({ node: classAttribute, messageId: 'noStaticWillChange', data: { token: match[1] } })
            }
          }
        }

        for (const property of collectStyleProperties(node)) {
          if (getPropertyKeyName(property) !== 'willChange') continue
          const value = property.value
          if (value.type !== 'Literal' || typeof value.value !== 'string') continue
          if (value.value.trim() === 'all') {
            context.report({ node: property, messageId: 'noWillChangeAll' })
          } else {
            context.report({ node: property, messageId: 'noStaticWillChange', data: { token: `willChange: '${value.value}'` } })
          }
        }
      },
    }
  },
}
