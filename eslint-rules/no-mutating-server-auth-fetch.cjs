/**
 * Local ESLint rule: a write goes through `serverAuthMutate`, never `serverAuthFetch`.
 *
 * `serverAuthMutate` takes the account that formed the intent as a required argument, so the
 * server can refuse a request whose cookie has since moved to somebody else. `serverAuthFetch`
 * takes no account, because a read under the next account's cookie returns that account's own
 * data and needs no guard.
 *
 * The line is held by the type: `serverAuthFetch` accepts `method?: 'GET' | 'HEAD'`, so a
 * mutating method does not compile however it is written. This rule is the second reading, in the
 * editor and in lint, of what the compiler already refuses.
 *
 * It reads the `method` from the call's own init object literal, through an `as` or a `satisfies`
 * cast, and from a template literal with no substitutions. It reads the file's imports once, so a
 * renamed import and a namespace import both still report. A call whose init is a variable, whose
 * method is computed, or whose callee is a property of some other object is not reported: the rule
 * proves what it can see, and a rule that guessed would be argued with rather than obeyed. The
 * type covers what is left.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const FETCH_NAME = 'serverAuthFetch'

function unwrapCast(node) {
  let current = node
  while (current && (current.type === 'TSAsExpression' || current.type === 'TSSatisfiesExpression')) {
    current = current.expression
  }
  return current
}

function importedName(specifier) {
  const imported = specifier.imported
  if (!imported) return null
  return imported.type === 'Identifier' ? imported.name : imported.value
}

/**
 * The local names in this file that stand for `serverAuthFetch`, and the namespace names that
 * carry it as a property.
 *
 * An import is always top level, so one pass over the program body finds every alias without
 * resolving a scope on each of the file's calls.
 */
function collectImportNames(program) {
  const aliases = new Set([FETCH_NAME])
  const namespaces = new Set()

  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') continue
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportSpecifier' && importedName(specifier) === FETCH_NAME) {
        aliases.add(specifier.local.name)
      }
      if (specifier.type === 'ImportNamespaceSpecifier') {
        namespaces.add(specifier.local.name)
      }
    }
  }

  return { aliases, namespaces }
}

function isServerAuthFetchCall(node, { aliases, namespaces }) {
  const callee = node.callee

  if (callee.type === 'Identifier') return aliases.has(callee.name)

  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === FETCH_NAME &&
    namespaces.has(callee.object.name)
  )
}

function findInitArgument(node) {
  const [, initArgument] = node.arguments
  if (!initArgument) return null
  const unwrapped = unwrapCast(initArgument)
  if (!unwrapped || unwrapped.type !== 'ObjectExpression') return null
  return unwrapped
}

function readStringValue(node) {
  const value = unwrapCast(node)
  if (!value) return null
  if (value.type === 'Literal') return typeof value.value === 'string' ? value.value : null
  if (value.type === 'TemplateLiteral' && value.expressions.length === 0) {
    return value.quasis[0].value.cooked
  }
  return null
}

function readMethodLiteral(initArgument) {
  for (const property of initArgument.properties) {
    if (property.type !== 'Property') continue
    const key = property.key
    const name = key.type === 'Identifier' ? key.name : key.type === 'Literal' ? key.value : null
    if (name !== 'method') continue
    const method = readStringValue(property.value)
    if (method === null) return null
    return { node: property, method: method.toUpperCase() }
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
    let importNames = { aliases: new Set([FETCH_NAME]), namespaces: new Set() }

    return {
      Program(node) {
        importNames = collectImportNames(node)
      },
      CallExpression(node) {
        if (!isServerAuthFetchCall(node, importNames)) return

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
