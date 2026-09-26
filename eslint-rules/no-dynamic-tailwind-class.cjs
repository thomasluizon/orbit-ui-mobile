
const { getAttributeValueNode } = require('./_jsx-strings.cjs')

const CLASS_ATTRIBUTES = new Set(['className', 'class', 'tw'])
const CLASS_VARIABLE_RE = /class(?:es|Name)?$/i
const OPEN_TOKEN_RE = /(?:^|\s)[a-z0-9:[\]-]*[-[]$/
const CONTINUES_TOKEN_RE = /^-[a-z0-9]/i

function splitsClassToken(node) {
  if (node.type === 'TemplateLiteral') {
    for (let index = 0; index < node.expressions.length; index += 1) {
      const before = node.quasis[index].value.cooked ?? ''
      const after = node.quasis[index + 1].value.cooked ?? ''
      if (OPEN_TOKEN_RE.test(before)) return true
      if (CONTINUES_TOKEN_RE.test(after)) return true
    }
    return false
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const { left, right } = node
    const leftIsString = left.type === 'Literal' && typeof left.value === 'string'
    const rightIsString = right.type === 'Literal' && typeof right.value === 'string'
    if (leftIsString && !rightIsString && OPEN_TOKEN_RE.test(left.value)) return true
    if (rightIsString && !leftIsString && CONTINUES_TOKEN_RE.test(right.value)) return true
    return splitsClassToken(left) || splitsClassToken(right)
  }
  return false
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban runtime-assembled Tailwind class names — the scanner cannot see them and the style is purged in production.',
    },
    schema: [],
    messages: {
      noDynamicClass:
        'This builds a Tailwind class name at runtime. The build-time scanner cannot see it, so the class is purged and the style vanishes IN PRODUCTION ONLY. Map each variant to a complete class string instead (`{ danger: "bg-red-600" }[tone]`).',
    },
  },
  create(context) {
    function check(node) {
      if (node == null) return
      if (splitsClassToken(node)) {
        context.report({ node, messageId: 'noDynamicClass' })
      }
    }

    return {
      JSXAttribute(node) {
        if (!node.name || !CLASS_ATTRIBUTES.has(node.name.name)) return
        check(getAttributeValueNode(node))
      },
      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier' || !CLASS_VARIABLE_RE.test(node.id.name)) return
        check(node.init)
      },
    }
  },
}
