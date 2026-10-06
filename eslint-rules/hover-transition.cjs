const { getAttributeValueNode } = require('./_jsx-strings.cjs')

const HOVER_VARIANT = /^(?:hover|group-hover(?:\/[^:]+)?)$/
const MOTION = new Set(['habit-control-motion', 'orbit-pill-action', 'orbit-list-row', 'orbit-list-row-body', 'orbit-list-row-action', 'orbit-menu-item', 'chip'])
const BACKGROUND_TRANSITIONS = new Set(['transition', 'transition-colors', 'transition-all', 'transition-none'])

function combineBranches(nodes) {
  return nodes.reduce((branches, node) => branches.flatMap((branch) =>
    collectClassBranches(node).map((sibling) => [...branch, ...sibling]),
  ), [[]])
}

function collectClassBranches(node) {
  if (node == null) return [[]]
  if (node.type === 'Literal' && typeof node.value === 'string') return [[node.value]]
  if (node.type === 'TemplateLiteral') {
    return combineBranches(node.expressions).map((branch) => [
      ...node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw ?? ''), ...branch,
    ])
  }
  if (node.type === 'ConditionalExpression') {
    return [...collectClassBranches(node.consequent), ...collectClassBranches(node.alternate)]
  }
  if (node.type === 'LogicalExpression') {
    if (node.operator === '&&') return [[], ...collectClassBranches(node.right)]
    return [...collectClassBranches(node.left), ...collectClassBranches(node.right)]
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') return combineBranches([node.left, node.right])
  if (node.type === 'ArrayExpression') return combineBranches(node.elements)
  if (node.type === 'CallExpression') {
    const receiver = node.callee.type === 'MemberExpression' ? [node.callee.object] : []
    return combineBranches([...receiver, ...node.arguments])
  }
  if (node.type === 'ObjectExpression') {
    return combineBranches(node.properties.filter((property) => property.type === 'Property').map((property) => property.value))
  }
  return [[]]
}

function parseClass(name) {
  const segments = []
  let depth = 0
  let start = 0
  for (let index = 0; index < name.length; index += 1) {
    const character = name[index]
    if (character === '[' || character === '(') depth += 1
    if (character === ']' || character === ')') depth -= 1
    if (character === ':' && depth === 0) {
      segments.push(name.slice(start, index))
      start = index + 1
    }
  }
  return { variants: segments, utility: name.slice(start).replace(/^!|!$/g, '') }
}

function coversBackground(utility) {
  if (MOTION.has(utility) || BACKGROUND_TRANSITIONS.has(utility)) return true
  const properties = /^(?:transition-\[([^\]]+)\]|\[transition-property:([^\]]+)\])$/.exec(utility)
  return properties !== null && (properties[1] ?? properties[2]).split(',')
    .some((property) => ['background-color', 'background', 'all'].includes(property.replaceAll('_', ' ').trim()))
}

function targetsDescendant(variant) {
  return variant === '*' || variant === '**' || (variant.startsWith('[') && variant.includes('&') && /[>+~_]/.test(variant))
}

function variantCovers(base, hover) {
  if (base === hover) return true
  return targetsDescendant(base) && base.endsWith(']') && hover.startsWith(base.slice(0, -1))
    && /^(?::(?:enabled|disabled|active|focus|focus-visible|focus-within|checked))+\]$/.test(hover.slice(base.length - 1))
}

function coversHover(transition, hover) {
  if (!coversBackground(transition.utility)) return false
  if (transition.variants.some((variant) => HOVER_VARIANT.test(variant))) return false
  const hoverTargets = hover.variants.filter(targetsDescendant)
  const transitionTargets = transition.variants.filter(targetsDescendant)
  if (hoverTargets.length !== transitionTargets.length || !transitionTargets.every((target, index) => variantCovers(target, hoverTargets[index]))) return false
  return transition.variants.every((variant) => variant === 'motion-safe' || hover.variants.some((hoverVariant) => variantCovers(variant, hoverVariant)))
}

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Require a base background transition for each hover-fill branch or explicit transition-none.' },
    schema: [],
    messages: { missing: 'Hover fills need a base transition covering their background in the same branch and on the same element, a motion class, or explicit transition-none.' },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.name !== 'className') return
        const missing = collectClassBranches(getAttributeValueNode(node)).some((branch) => {
          const classes = branch.flatMap((text) => text.split(/\s+/)).map(parseClass)
          return classes.some((hover) => hover.utility.startsWith('bg-') && hover.variants.some((variant) => HOVER_VARIANT.test(variant))
            && !classes.some((transition) => coversHover(transition, hover)))
        })
        if (missing) context.report({ node, messageId: 'missing' })
      },
    }
  },
}
