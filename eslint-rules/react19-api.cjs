
const REPLACEMENTS = new Map([
  ['forwardRef', 'forwardRefRemoved'],
  ['useContext', 'useContextReplaced'],
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
      description: 'Use React 19 APIs on the web: `ref` is a prop (no forwardRef), and `use(Context)` replaces `useContext`.',
    },
    schema: [],
    messages: {
      forwardRefRemoved:
        'React 19 passes `ref` as an ordinary prop — `forwardRef` is a deprecated wrapper. Take `ref` in the props object and drop the wrapper.',
      useContextReplaced:
        'React 19 replaces `useContext(Context)` with `use(Context)`, which may also be called conditionally. Import `use` from react.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee
        let name = null
        if (callee.type === 'Identifier') name = callee.name
        else if (isReactMember(callee, 'forwardRef')) name = 'forwardRef'
        else if (isReactMember(callee, 'useContext')) name = 'useContext'

        const messageId = name ? REPLACEMENTS.get(name) : null
        if (messageId) {
          context.report({ node: callee, messageId })
        }
      },
    }
  },
}
