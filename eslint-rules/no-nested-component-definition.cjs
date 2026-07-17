/**
 * Local ESLint rule: never define a React component inside another component.
 *
 * A component declared in another component's body is a NEW function identity on
 * every parent render, so React unmounts and remounts the whole subtree: state is
 * lost, effects re-fire, inputs lose focus, and every animation restarts. It reads
 * as a random bug, never as a rendering mistake.
 *
 * A component is identified structurally: a capitalized function that returns JSX.
 * A nested helper returning JSX but named in camelCase (`renderRow`) is a render
 * function called directly, not mounted as an element, so it does not remount a
 * subtree and is not reported.
 *
 * apps/mobile also has `react-hooks/static-components` at error, which overlaps
 * this rule; apps/web has no such gate, which is why this exists.
 */

const COMPONENT_NAME_RE = /^[A-Z]/

function returnsJsx(node) {
  const body = node.body
  if (body == null) return false
  if (body.type === 'JSXElement' || body.type === 'JSXFragment') return true
  if (body.type !== 'BlockStatement') return false

  let found = false
  const walk = (current) => {
    if (found || current == null || typeof current !== 'object') return
    if (Array.isArray(current)) {
      for (const item of current) walk(item)
      return
    }
    if (typeof current.type !== 'string') return
    if (current.type === 'FunctionDeclaration' || current.type === 'FunctionExpression' || current.type === 'ArrowFunctionExpression') {
      return
    }
    if (current.type === 'ReturnStatement') {
      const argument = current.argument
      if (argument && (argument.type === 'JSXElement' || argument.type === 'JSXFragment')) {
        found = true
        return
      }
      if (argument && argument.type === 'ConditionalExpression') {
        for (const branch of [argument.consequent, argument.alternate]) {
          if (branch.type === 'JSXElement' || branch.type === 'JSXFragment') found = true
        }
      }
      return
    }
    for (const key of Object.keys(current)) {
      if (key === 'parent') continue
      walk(current[key])
    }
  }
  walk(body.body)
  return found
}

function getFunctionName(node) {
  if (node.type === 'FunctionDeclaration') return node.id ? node.id.name : null
  const parent = node.parent
  if (parent && parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name
  return null
}

function findEnclosingComponent(node) {
  let current = node.parent
  while (current) {
    const isFunction =
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression' ||
      current.type === 'ArrowFunctionExpression'
    if (isFunction) {
      const name = getFunctionName(current)
      if (name && COMPONENT_NAME_RE.test(name) && returnsJsx(current)) return name
    }
    current = current.parent
  }
  return null
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban React components defined inside another component — the subtree remounts on every parent render.',
    },
    schema: [],
    messages: {
      nestedComponent:
        '<{{name}}> is defined inside <{{parent}}>, so it is a new component type on every render of <{{parent}}>: React remounts the whole subtree, losing state and focus and restarting effects. Move it to module scope.',
    },
  },
  create(context) {
    function check(node) {
      const name = getFunctionName(node)
      if (!name || !COMPONENT_NAME_RE.test(name)) return
      if (!returnsJsx(node)) return
      const parent = findEnclosingComponent(node)
      if (!parent) return
      context.report({ node, messageId: 'nestedComponent', data: { name, parent } })
    }

    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    }
  },
}
