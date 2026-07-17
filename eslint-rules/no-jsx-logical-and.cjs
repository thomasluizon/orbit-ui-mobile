/**
 * Local ESLint rule: use a ternary, not `&&`, for conditional rendering.
 *
 * On mobile this is a CRASH, not a style preference: `{items.length && <List/>}`
 * renders the raw number `0` when the array is empty, and React Native throws
 * "Text strings must be rendered within a <Text> component". On web the same
 * expression renders a stray `0` into the layout.
 *
 * Only reports a left operand that can produce a renderable falsy value — a
 * number, a string, or `.length`. A boolean-typed left operand (`isOpen &&`,
 * `a === b &&`, `!x &&`) renders nothing when false and is genuinely safe, so it
 * is not reported; flagging it would make the rule noise and get it disabled.
 *
 * NOTE on the harvest table: it specifies `{cond && <X/>}` wholesale. That form
 * would fire on ~every conditional render in both apps for zero real defects. The
 * narrowed version is the one worth having — it targets the actual failure.
 */

const NUMERIC_COERCING_OPERATORS = new Set(['+', '-', '*', '/', '%', '**'])

function isBooleanish(node) {
  if (node == null) return false
  switch (node.type) {
    case 'BinaryExpression':
      return !NUMERIC_COERCING_OPERATORS.has(node.operator)
    case 'UnaryExpression':
      return node.operator === '!'
    case 'LogicalExpression':
      return isBooleanish(node.left) && isBooleanish(node.right)
    case 'Literal':
      return typeof node.value === 'boolean'
    default:
      return false
  }
}

function isRiskyLeft(node) {
  if (isBooleanish(node)) return false
  if (node.type === 'MemberExpression') {
    const property = node.property
    return property.type === 'Identifier' && property.name === 'length'
  }
  if (node.type === 'Literal') return typeof node.value === 'number' || typeof node.value === 'string'
  return false
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban `&&` conditional rendering whose left operand can render a falsy value (a raw 0 crashes React Native).',
    },
    schema: [],
    messages: {
      noLogicalAnd:
        'A falsy left operand here renders a raw value into the tree — on React Native a `0` CRASHES ("Text strings must be rendered within a <Text>"), and on web it prints a stray 0. Use a ternary: `{cond ? <X /> : null}`.',
    },
  },
  create(context) {
    return {
      'JSXExpressionContainer > LogicalExpression'(node) {
        if (node.operator !== '&&') return
        if (node.parent.parent && node.parent.parent.type === 'JSXAttribute') return
        if (!isRiskyLeft(node.left)) return
        context.report({ node, messageId: 'noLogicalAnd' })
      },
    }
  },
}
