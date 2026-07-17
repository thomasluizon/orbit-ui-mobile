/**
 * Local ESLint rule: never key an AnimatePresence child by array index.
 *
 * This is not the generic index-key smell. AnimatePresence uses the key to decide
 * which child is entering and which is exiting: with an index key, removing row 2
 * of 5 shifts every subsequent key down one, so AnimatePresence concludes the LAST
 * row left and animates the WRONG row out. The habit list, social list, and
 * bulk-action surfaces are all keyed dynamic lists.
 *
 * Matches `key={index}` / `key={i}` — and `key={`${index}`}` — on a `.map()`
 * callback's returned element inside an <AnimatePresence> subtree, where `index`
 * is bound to the map callback's second parameter. Binding to the parameter (not
 * to a name blocklist) is what keeps a legitimate `key={item.index}` out of scope.
 */

const { getAttribute, getAttributeValueNode, getElementName } = require('./_jsx-strings.cjs')

function hasPresenceAncestor(node) {
  let current = node.parent
  while (current) {
    if (current.type === 'JSXElement') {
      const name = getElementName(current.openingElement)
      if (name === 'AnimatePresence') return true
    }
    current = current.parent
  }
  return false
}

function findEnclosingMapIndexName(node) {
  let current = node.parent
  while (current) {
    const isCallback =
      current.type === 'ArrowFunctionExpression' || current.type === 'FunctionExpression'
    if (isCallback) {
      const call = current.parent
      const isMapCall =
        call &&
        call.type === 'CallExpression' &&
        call.callee.type === 'MemberExpression' &&
        call.callee.property.type === 'Identifier' &&
        call.callee.property.name === 'map' &&
        call.arguments[0] === current
      if (isMapCall) {
        const indexParameter = current.params[1]
        return indexParameter && indexParameter.type === 'Identifier' ? indexParameter.name : null
      }
    }
    current = current.parent
  }
  return null
}

function referencedIdentifierName(node) {
  if (node == null) return null
  if (node.type === 'Identifier') return node.name
  if (node.type === 'TemplateLiteral' && node.expressions.length === 1 && node.quasis.every((quasi) => (quasi.value.cooked ?? '') === '')) {
    return referencedIdentifierName(node.expressions[0])
  }
  return null
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require a stable id key on AnimatePresence children — an index key animates the wrong row out.',
    },
    schema: [],
    messages: {
      indexKey:
        'Keying an <AnimatePresence> child by the map index (`{{name}}`) makes the WRONG row animate out when an item is removed: every later key shifts down one, so AnimatePresence thinks the last row left. Key by a stable id (`key={item.id}`).',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const keyAttribute = getAttribute(node, 'key')
        if (!keyAttribute) return
        const name = referencedIdentifierName(getAttributeValueNode(keyAttribute))
        if (!name) return
        if (!hasPresenceAncestor(node)) return
        if (findEnclosingMapIndexName(node) !== name) return
        context.report({ node: keyAttribute, messageId: 'indexKey', data: { name } })
      },
    }
  },
}
