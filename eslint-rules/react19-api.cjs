const REPLACEMENTS = new Map([
  ['forwardRef', 'forwardRefRemoved'],
])

function isReactMember(node, name) {
  return (
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === 'React' &&
    node.property.type === 'Identifier' &&
    node.property.name === name
  )
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Use React 19 APIs on the web: `ref` is an ordinary prop, so `forwardRef` is a deprecated wrapper.',
    },
    schema: [],
    messages: {
      forwardRefRemoved:
        'React 19 passes `ref` as an ordinary prop — `forwardRef` is a deprecated wrapper. Take `ref` in the props object and drop the wrapper.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee
        let name = null
        if (callee.type === 'Identifier') name = callee.name
        else if (isReactMember(callee, 'forwardRef')) name = 'forwardRef'

        const messageId = name ? REPLACEMENTS.get(name) : null
        if (messageId) {
          context.report({ node: callee, messageId })
        }
      },
    }
  },
}
