/**
 * Local ESLint rule: a write goes through `serverAuthMutate`, never `serverAuthFetch`.
 *
 * `serverAuthMutate` takes the account that formed the intent as a required argument, so the
 * server can refuse a request whose cookie has since moved to somebody else. `serverAuthFetch`
 * takes no account, because a read under the next account's cookie returns that account's own
 * data and needs no guard.
 *
 * The type alone cannot hold that line. Nothing stops an author reaching for the read function and
 * passing `{ method: 'DELETE' }`, and the result compiles, runs, and silently loses the guard on
 * exactly the requests that need it. This rule is the part that fails.
 *
 * It reads the `method` from the call's own init object literal. A call whose init is a variable,
 * or whose method is computed, is not reported: the rule proves what it can see, and a rule that
 * guessed would be argued with rather than obeyed.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function getCalleeName(node) {
  if (node.callee.type === 'Identifier') return node.callee.name
  return null
}

function findInitArgument(node) {
  const [, initArgument] = node.arguments
  if (!initArgument || initArgument.type !== 'ObjectExpression') return null
  return initArgument
}

function readMethodLiteral(initArgument) {
  for (const property of initArgument.properties) {
    if (property.type !== 'Property') continue
    const key = property.key
    const name = key.type === 'Identifier' ? key.name : key.type === 'Literal' ? key.value : null
    if (name !== 'method') continue
    const value = property.value
    if (value.type !== 'Literal' || typeof value.value !== 'string') return null
    return { node: property, method: value.value.toUpperCase() }
  }
  return null
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require serverAuthMutate, not serverAuthFetch, for a request that changes server state.',
    },
    schema: [],
    messages: {
      useServerAuthMutate:
        "`serverAuthFetch` carries no account, so a {{method}} through it can land on whichever account's cookie the browser holds when it sends. Call `serverAuthMutate(path, init, intendedAccountId)` instead, and take the account from the caller.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (getCalleeName(node) !== 'serverAuthFetch') return

        const initArgument = findInitArgument(node)
        if (!initArgument) return

        const method = readMethodLiteral(initArgument)
        if (!method || !MUTATING_METHODS.has(method.method)) return

        context.report({
          node: method.node,
          messageId: 'useServerAuthMutate',
          data: { method: method.method },
        })
      },
    }
  },
}
