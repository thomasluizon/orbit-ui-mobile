/**
 * Local ESLint rule: never pass `onScroll` or `scrollEventThrottle` to
 * `react-native-draggable-flatlist`'s `<DraggableFlatList>`.
 *
 * The library silently REPLACES any caller-supplied `onScroll` with its own
 * reanimated scroll handler, so the prop type-checks, renders, and never fires
 * (and `scrollEventThrottle` throttles a handler that will never run). That
 * invisible discard shipped a scroll-to-top FAB that could never appear; the
 * supported scroll-offset API is `onScrollOffsetChange`:
 * https://github.com/computerjazz/react-native-draggable-flatlist/blob/v4.0.3/src/components/DraggableFlatList.tsx#L396
 *
 * Matched by element name (`<DraggableFlatList>`), the same static match the
 * sibling rules use for `<LinearGradient>` - plain `FlatList`/`ScrollView`
 * `onScroll` stays legal.
 */

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
