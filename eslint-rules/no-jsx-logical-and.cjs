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
