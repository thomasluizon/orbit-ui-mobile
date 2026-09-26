
const { getAttribute, getElementName } = require('./_jsx-strings.cjs')

const LINK_ELEMENTS = new Set(['a', 'Link', 'NextLink'])

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban href="#" — point at a real destination or use a button.',
    },
    schema: [],
    messages: {
      noDeadHref:
        '`href="{{value}}"` navigates nowhere. Point at a real destination, or use a <button> if this control performs an action rather than navigating.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const elementName = getElementName(node)
        if (!elementName || !LINK_ELEMENTS.has(elementName)) return

        const hrefAttribute = getAttribute(node, 'href')
        if (!hrefAttribute) return
        const value = hrefAttribute.value
        if (value == null || value.type !== 'Literal' || typeof value.value !== 'string') return

        const normalized = value.value.trim()
        if (normalized === '#' || normalized === '') {
          context.report({ node: hrefAttribute, messageId: 'noDeadHref', data: { value: normalized } })
        }
      },
    }
  },
}
