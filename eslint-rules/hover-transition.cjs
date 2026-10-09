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

function splitOutsideBrackets(name, separator) {
  const segments = []
  let depth = 0
  let start = 0
  for (let index = 0; index < name.length; index += 1) {
    const character = name[index]
    if (character === '[' || character === '(') depth += 1
    if (character === ']' || character === ')') depth -= 1
    if (character === separator && depth === 0) {
      segments.push(name.slice(start, index))
      start = index + 1
    }
  }
  return [...segments, name.slice(start)]
}

function parseClass(name) {
  const segments = splitOutsideBrackets(name, ':')
  return { variants: segments.slice(0, -1), utility: segments.at(-1).replace(/^!|!$/g, '') }
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

function coversTarget(transition, hover) {
  if (transition.variants.some((variant) => HOVER_VARIANT.test(variant))) return false
  const hoverTargets = hover.variants.filter(targetsDescendant)
  const transitionTargets = transition.variants.filter(targetsDescendant)
  if (hoverTargets.length !== transitionTargets.length || !transitionTargets.every((target, index) => variantCovers(target, hoverTargets[index]))) return false
  return transition.variants.every((variant) => variant === 'motion-safe' || hover.variants.some((hoverVariant) => variantCovers(variant, hoverVariant)))
}

function backgroundIndexes(utility) {
  const properties = /^(?:transition-\[([^\]]+)\]|\[transition-property:([^\]]+)\])$/.exec(utility)
  if (properties === null) return [utility === 'transition-colors' || utility === 'transition' ? 1 : 0]
  return splitOutsideBrackets(properties[1] ?? properties[2], ',')
    .flatMap((property, index) => ['background-color', 'background', 'all'].includes(property.replaceAll('_', ' ').trim()) ? [index] : [])
}

function timingValues(utility, property, prefix) {
  const arbitrary = new RegExp(`^\\[${property}:(.+)\\]$`).exec(utility)
  if (arbitrary !== null) return splitOutsideBrackets(arbitrary[1], ',').map((value) => value.trim())
  if (!utility.startsWith(`${prefix}-`)) return null
  const value = utility.slice(prefix.length + 1)
  return splitOutsideBrackets(value.startsWith('[') ? value.slice(1, -1) : value, ',')
}

function inlineTransitionClasses(opening) {
  const style = opening.attributes.find((attribute) => attribute.type === 'JSXAttribute' && attribute.name.name === 'style')
  const expression = getAttributeValueNode(style)
  const object = expression?.type === 'TSAsExpression' ? expression.expression : expression
  if (object?.type !== 'ObjectExpression') return []
  const declarations = object.properties.filter((property) => property.type === 'Property'
    && property.value.type === 'Literal' && typeof property.value.value === 'string')
  const classes = []
  for (const declaration of declarations) {
    const name = declaration.key.name ?? declaration.key.value
    const value = declaration.value.value
    if (name === 'transitionDuration' || name === 'transitionTimingFunction') {
      classes.push({ variants: [], utility: `[${name === 'transitionDuration' ? 'transition-duration' : 'transition-timing-function'}:${value}]` })
    }
    if (name === 'transition') {
      const entries = splitOutsideBrackets(value, ',').map((entry) => splitOutsideBrackets(entry.trim(), ' ').filter(Boolean))
      for (const [index, property] of ['transition-property', 'transition-duration', 'transition-timing-function'].entries()) {
        const values = entries.map((entry) => entry[index] ?? '')
          .map((entry) => entry === '240ms' ? 'var(--dur-hover-control)' : entry === '380ms' ? 'var(--dur-hover)' : entry)
        classes.push({ variants: [], utility: `[${property}:${values.join(',')}]` })
      }
    }
  }
  return classes
}

function timingProblem(classes, hover) {
  const matching = classes.filter((candidate) => coversTarget(candidate, hover))
  const transitions = matching.filter((candidate) => coversBackground(candidate.utility))
  if (transitions.length === 0) return 'missing'
  if (transitions.some(({ utility }) => utility === 'transition-none')) return null
  const hasMotion = transitions.some(({ utility }) => MOTION.has(utility))
  const explicit = transitions.filter(({ utility }) => !MOTION.has(utility))
  const indexes = explicit.length === 0 ? [0] : explicit.flatMap(({ utility }) => backgroundIndexes(utility))
  for (const [property, prefix, accepted, message] of [
    ['transition-duration', 'duration', ['var(--dur-hover-control)', 'var(--dur-hover)'], 'duration'],
    ['transition-timing-function', 'ease', ['var(--ease-standard)'], 'timing'],
  ]) {
    const values = matching.map(({ utility }) => timingValues(utility, property, prefix)).filter((value) => value !== null)
    if (values.length === 0 && !hasMotion) return message
    if (values.some((list) => indexes.some((index) => !accepted.includes(list[index % list.length])))) return message
  }
  return null
}

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Require hover fills to use a base background transition with hover durations and standard easing.' },
    schema: [],
    messages: {
      missing: 'Hover fills need a base transition covering their background in the same branch and on the same element, a motion class, or explicit transition-none.',
      duration: 'Hover-fill background transitions need --dur-hover-control or --dur-hover, including the background entry in a transition-duration list.',
      timing: 'Hover-fill background transitions need --ease-standard, including the background entry in a transition-timing-function list.',
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.name !== 'className') return
        const hasFabFill = node.parent.attributes.some((attribute) => attribute.type === 'JSXAttribute' && attribute.name.name === 'data-fab')
        for (const branch of collectClassBranches(getAttributeValueNode(node))) {
          const inlineClasses = inlineTransitionClasses(node.parent)
          const inlineProperties = new Set(inlineClasses.map(({ utility }) => utility.slice(1, utility.indexOf(':'))))
          const classes = branch.flatMap((text) => text.split(/\s+/)).map(parseClass)
            .filter(({ utility, variants }) => variants.length > 0 || ![...inlineProperties].some((property) =>
              property === 'transition-property' ? coversBackground(utility) : timingValues(utility, property, property === 'transition-duration' ? 'duration' : 'ease') !== null))
          classes.push(...inlineClasses)
          const fills = classes.filter((hover) => hover.utility.startsWith('bg-') && hover.variants.some((variant) => HOVER_VARIANT.test(variant)))
          if (hasFabFill) fills.push({ utility: 'bg-', variants: ['hover'] })
          for (const hover of fills) {
            const problem = timingProblem(classes, hover)
            if (problem !== null) {
              context.report({ node, messageId: problem })
              return
            }
          }
        }
      },
    }
  },
}
