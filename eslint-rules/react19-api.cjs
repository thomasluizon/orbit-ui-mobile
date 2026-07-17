/**
 * Local ESLint rule: use the React 19 spellings (web only).
 *
 * apps/web is Next.js 16 / React 19, where:
 *  - `ref` is an ordinary prop, so `forwardRef` is a deprecated wrapper that adds
 *    an indirection and a display-name problem for nothing;
 *  - `use(Context)` replaces `useContext(Context)` and, unlike the hook, may be
 *    called conditionally.
 *
 * WEB ONLY, deliberately. The harvest table flags this explicitly: do not point
 * this rule at apps/mobile until its React version is confirmed — React Native's
 * renderer version is not the same lever as the React package version, and a
 * premature `forwardRef` removal there would break refs at runtime.
 */

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
