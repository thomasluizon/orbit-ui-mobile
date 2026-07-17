/**
 * Shared static-string extraction for the `local/*` DESIGN.md rules.
 *
 * Every className/style gate in this directory needs the same three things:
 * flatten a JSX attribute's static string parts, find the `className`/`style`
 * attribute on an element, and walk `style={{ ... }}` object properties. Written
 * once here rather than copied into each rule (CLAUDE.md standard 10 — the third
 * real use is well past).
 *
 * Deliberately static-only: a value assembled at runtime (`cn(a, b)`, a variable,
 * a function call) contributes its literal parts and nothing else. These rules
 * report what they can prove, never what they guess.
 */

function collectStaticStrings(node) {
  if (node == null) return []
  if (node.type === 'Literal' && typeof node.value === 'string') return [node.value]
  if (node.type === 'TemplateLiteral') {
    const quasis = node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw ?? '')
    const expressions = node.expressions.flatMap((expression) => collectStaticStrings(expression))
    return [...quasis, ...expressions]
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    return [...collectStaticStrings(node.left), ...collectStaticStrings(node.right)]
  }
  if (node.type === 'ConditionalExpression') {
    return [...collectStaticStrings(node.consequent), ...collectStaticStrings(node.alternate)]
  }
  if (node.type === 'LogicalExpression') {
    return [...collectStaticStrings(node.left), ...collectStaticStrings(node.right)]
  }
  if (node.type === 'ArrayExpression') {
    return node.elements.flatMap((element) => collectStaticStrings(element))
  }
  if (node.type === 'CallExpression') {
    return node.arguments.flatMap((argument) => collectStaticStrings(argument))
  }
  if (node.type === 'ObjectExpression') {
    return node.properties.flatMap((property) =>
      property.type === 'Property' ? collectStaticStrings(property.value) : [],
    )
  }
  return []
}

function getAttribute(node, name) {
  for (const attribute of node.attributes) {
    if (attribute.type !== 'JSXAttribute' || !attribute.name) continue
    if (attribute.name.name === name) return attribute
  }
  return null
}

function getAttributeValueNode(attribute) {
  const value = attribute?.value
  if (value == null) return null
  if (value.type === 'JSXExpressionContainer') return value.expression
  return value
}

function getAttributeText(node, name) {
  const attribute = getAttribute(node, name)
  if (!attribute) return ''
  return collectStaticStrings(getAttributeValueNode(attribute)).join(' ')
}

function getClassText(node) {
  return [getAttributeText(node, 'className'), getAttributeText(node, 'class'), getAttributeText(node, 'tw')]
    .filter(Boolean)
    .join(' ')
}

function getPropertyKeyName(property) {
  if (property.type !== 'Property') return null
  const key = property.key
  if (key.type === 'Identifier' && !property.computed) return key.name
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value
  return null
}

/**
 * Yields every `{ key, value }` Property inside an expression, flattening arrays,
 * conditionals and nested object literals (React Native's `style={[base, cond && extra]}`
 * form and StyleSheet.create's `{ row: { ... } }` form alike).
 */
function collectObjectProperties(node) {
  const found = []
  const walk = (current) => {
    if (current == null) return
    if (current.type === 'ObjectExpression') {
      for (const property of current.properties) {
        if (property.type !== 'Property') continue
        found.push(property)
        walk(property.value)
      }
      return
    }
    if (current.type === 'ArrayExpression') {
      for (const element of current.elements) walk(element)
      return
    }
    if (current.type === 'LogicalExpression') {
      walk(current.left)
      walk(current.right)
      return
    }
    if (current.type === 'ConditionalExpression') {
      walk(current.consequent)
      walk(current.alternate)
    }
  }
  walk(node)
  return found
}

/** Every `{ key, value }` Property reachable from a JSX element's `style` prop. */
function collectStyleProperties(node) {
  const attribute = getAttribute(node, 'style')
  if (!attribute) return []
  return collectObjectProperties(getAttributeValueNode(attribute))
}

/** True when `name` is a component-shaped JSX name (capitalized or namespaced, e.g. `motion.div`). */
function getElementName(node) {
  const name = node.name
  if (!name) return null
  if (name.type === 'JSXIdentifier') return name.name
  if (name.type === 'JSXMemberExpression') {
    const object = name.object.type === 'JSXIdentifier' ? name.object.name : null
    const property = name.property.name
    return object ? `${object}.${property}` : property
  }
  return null
}

module.exports = {
  collectObjectProperties,
  collectStaticStrings,
  collectStyleProperties,
  getAttribute,
  getAttributeText,
  getAttributeValueNode,
  getClassText,
  getElementName,
  getPropertyKeyName,
}
