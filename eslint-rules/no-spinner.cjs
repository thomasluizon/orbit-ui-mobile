const { getElementName } = require('./_jsx-strings.cjs')

const SPINNER_NAMES = new Set([
  'ActivityIndicator',
  'CircularProgress',
  'Loader',
  'Loader2',
  'LoaderCircle',
  'Loader2Icon',
  'LoaderCircleIcon',
  'IconLoader',
  'IconLoader2',
  'IconLoader3',
  'IconLoaderQuarter',
  'Spinner',
])
const SPIN_CLASS_RE = /(?:^|[\s:])animate-(?:spin(?![\w-])|\[spin)/
/** An inline CSS animation that runs a keyframe named `spin`, such as `spin 1s linear infinite`. */
const SPIN_ANIMATION_RE = /(?:^|[\s,])spin\s+\d*\.?\d+m?s\b/
/** A full turn, the rotation a busy wheel repeats. */
const FULL_TURN_RE = /^-?(?:360deg|1turn)$/
/** A rotation key whose numeric value counts in degrees. */
const ROTATION_KEYS = new Set(['rotate', 'rotateZ', 'rotation', 'toValue'])
const TIMING_CALLS = new Set(['withTiming', 'withSpring'])
/** A list that builds its own `RefreshControl` from `onRefresh` and `refreshing` (VirtualizedList renders the native wheel). */
const LIST_ELEMENT_RE = /(?:FlatList|SectionList|ScrollView|VirtualizedList|FlashList)$/
const RING_ELEMENTS = new Set(['svg', 'Svg', 'circle', 'Circle'])
const DETERMINATE_ATTRIBUTES = new Set(['aria-valuenow', 'accessibilityValue'])

function spinnerName(name) {
  if (!name) return null
  const last = name.split('.').pop()
  return SPINNER_NAMES.has(last) ? last : null
}

function attributeNamed(opening, name) {
  return opening.attributes.find((attribute) => attribute.type === 'JSXAttribute' && attribute.name.name === name)
}

/** The static value of an attribute: a string, a number, a boolean, an array of those, or `undefined` when it is computed. */
function staticValue(node) {
  if (!node) return undefined
  if (node.type === 'Literal') return node.value
  if (node.type === 'JSXExpressionContainer') return staticValue(node.expression)
  if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number') return -node.argument.value
  if (node.type === 'ArrayExpression') {
    const values = node.elements.map(staticValue)
    return values.every((value) => value !== undefined) ? values : undefined
  }
  return undefined
}

function attributeValue(opening, name) {
  const attribute = attributeNamed(opening, name)
  return attribute ? staticValue(attribute.value) : undefined
}

/**
 * The one `RefreshControl` form that draws nothing: it never holds its refreshing state, its wheel, title and disc are
 * transparent, and Android's disc (which keeps its elevation shadow) starts above the list. The list's skeleton rows are
 * the refresh feedback.
 */
function isHiddenRefreshControl(opening) {
  if (opening.attributes.some((attribute) => attribute.type === 'JSXSpreadAttribute')) return false
  const colors = attributeValue(opening, 'colors')
  const offset = attributeValue(opening, 'progressViewOffset')
  return attributeValue(opening, 'refreshing') === false
    && attributeValue(opening, 'tintColor') === 'transparent'
    && attributeValue(opening, 'progressBackgroundColor') === 'transparent'
    && Array.isArray(colors) && colors.length > 0 && colors.every((color) => color === 'transparent')
    && typeof offset === 'number' && offset < 0
}

function isIndeterminateProgressbar(opening) {
  const role = attributeValue(opening, 'role') ?? attributeValue(opening, 'accessibilityRole')
  if (role !== 'progressbar') return false
  return !opening.attributes.some((attribute) => attribute.type === 'JSXAttribute' && DETERMINATE_ATTRIBUTES.has(attribute.name.name))
}

function rendersRing(node) {
  if (!node) return false
  switch (node.type) {
    case 'JSXElement':
      return RING_ELEMENTS.has(getElementName(node.openingElement)) || node.children.some(rendersRing)
    case 'JSXFragment':
      return node.children.some(rendersRing)
    case 'JSXExpressionContainer':
      return rendersRing(node.expression)
    case 'ConditionalExpression':
      return rendersRing(node.consequent) || rendersRing(node.alternate)
    case 'LogicalExpression':
      return rendersRing(node.right)
    default:
      return false
  }
}

/** A numeric full turn: `360` or `-360` as the first argument of a timing call or as the value of a rotation key. */
function isNumericFullTurn(node) {
  const turn = node.parent?.type === 'UnaryExpression' && node.parent.operator === '-' ? node.parent : node
  const parent = turn.parent
  if (!parent) return false
  if (parent.type === 'CallExpression' && parent.arguments[0] === turn && parent.callee.type === 'Identifier') return TIMING_CALLS.has(parent.callee.name)
  if (parent.type !== 'Property' || parent.value !== turn) return false
  const key = parent.key.type === 'Identifier' ? parent.key.name : parent.key.value
  return ROTATION_KEYS.has(key)
}

function isInfinity(node) {
  if (node.type === 'Identifier') return node.name === 'Infinity'
  return node.type === 'MemberExpression' && !node.computed && node.object.type === 'Identifier' && node.object.name === 'Number'
    && node.property.type === 'Identifier' && node.property.name === 'POSITIVE_INFINITY'
}

function isLoopCall(node) {
  const callee = node.callee
  if (callee.type === 'Identifier') return callee.name === 'withRepeat'
  return callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier' && callee.property.name === 'loop'
    && callee.object.type === 'Identifier' && callee.object.name === 'Animated'
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban every spinner (DESIGN.md Bans: no spinner). Loading content shows a skeleton; a waiting control shows `SkeletonFace`.',
    },
    schema: [],
    messages: {
      noSpinner:
        'A spinner is banned (DESIGN.md "Bans"). Content that loads shows a `Skeleton` shaped like its final layout; a control that waits keeps its label, is disabled and busy, and shows `SkeletonFace`.',
      visibleRefreshIndicator:
        "A `RefreshControl`, or a list given `onRefresh` (which builds one), draws the native refresh wheel (DESIGN.md \"Bans\": no spinner). Keep the pull gesture in the hidden form (`refreshing={false}`, `colors={['transparent']}`, `progressBackgroundColor=\"transparent\"`, `tintColor=\"transparent\"`, a negative `progressViewOffset`) and show the list's skeleton rows while the request runs.",
    },
  },
  create(context) {
    const loopCalls = []
    let drawsFullTurn = false
    const reportString = (node, value) => {
      if (typeof value !== 'string') return
      if (SPIN_CLASS_RE.test(value) || SPIN_ANIMATION_RE.test(value)) context.report({ node, messageId: 'noSpinner' })
      if (FULL_TURN_RE.test(value.trim())) drawsFullTurn = true
    }
    return {
      Property(node) {
        const key = node.key.type === 'Identifier' ? node.key.name : node.key.value
        if (key === 'repeat' && isInfinity(node.value)) loopCalls.push(node)
      },
      ImportDeclaration(node) {
        for (const specifier of node.specifiers) {
          if (spinnerName(specifier.imported?.name ?? specifier.local?.name)) context.report({ node: specifier, messageId: 'noSpinner' })
        }
      },
      JSXOpeningElement(node) {
        const name = getElementName(node)
        if (spinnerName(name)) context.report({ node, messageId: 'noSpinner' })
        if (name?.split('.').pop() === 'RefreshControl' && !isHiddenRefreshControl(node)) context.report({ node, messageId: 'visibleRefreshIndicator' })
        if (name && LIST_ELEMENT_RE.test(name) && attributeNamed(node, 'onRefresh')) context.report({ node, messageId: 'visibleRefreshIndicator' })
      },
      JSXElement(node) {
        if (isIndeterminateProgressbar(node.openingElement) && node.children.some(rendersRing)) context.report({ node: node.openingElement, messageId: 'noSpinner' })
      },
      MemberExpression(node) {
        if (!node.computed && node.property.type === 'Identifier' && node.property.name === 'ActivityIndicator') context.report({ node, messageId: 'noSpinner' })
      },
      CallExpression(node) {
        if (isLoopCall(node)) loopCalls.push(node)
      },
      Literal(node) {
        reportString(node, node.value)
        if (Math.abs(node.value) === 360 && typeof node.value === 'number' && isNumericFullTurn(node)) drawsFullTurn = true
      },
      TemplateElement(node) {
        reportString(node, node.value.cooked)
      },
      'Program:exit'() {
        if (!drawsFullTurn) return
        for (const node of loopCalls) context.report({ node, messageId: 'noSpinner' })
      },
    }
  },
}
