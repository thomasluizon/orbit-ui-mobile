const { getAttribute, getElementName } = require('./_jsx-strings.cjs')

const DRAGGABLE_ELEMENT = 'DraggableFlatList'
const DISCARDED_PROPS = ['onScroll', 'scrollEventThrottle']

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban onScroll/scrollEventThrottle on DraggableFlatList - the library discards them; use onScrollOffsetChange.',
      url: 'https://github.com/thomasluizon/orbit-ui-mobile/pull/568',
    },
    schema: [],
    messages: {
      noDiscardedScrollProp:
        'DraggableFlatList discards onScroll (the lib installs its own reanimated handler). Use onScrollOffsetChange.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (getElementName(node) !== DRAGGABLE_ELEMENT) return
        for (const propName of DISCARDED_PROPS) {
          const attribute = getAttribute(node, propName)
          if (attribute) {
            context.report({ node: attribute, messageId: 'noDiscardedScrollProp' })
          }
        }
      },
    }
  },
}
