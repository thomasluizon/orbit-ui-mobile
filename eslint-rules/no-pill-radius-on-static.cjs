const {
  collectObjectProperties,
  collectStaticStrings,
  getAttribute,
  getAttributeValueNode,
  getClassText,
  getElementName,
  getPropertyKeyName,
} = require('./_jsx-strings.cjs')

const PILL_CLASS_RE = /(?:^|\s|:)(?:rounded-full|rounded-\[999(?:px|rem)?\]|rounded-\[9999(?:px|rem)?\])(?:\s|$)/
const RADIUS_KEYS = new Set(['borderRadius'])
const TEXT_ELEMENTS = new Set(['Text', 'RNText', 'Label', 'span', 'p'])

const INTERACTIVE = new Set([
  'button', 'a', 'summary', 'label', 'select', 'input', 'textarea',
  'Button', 'PillButton', 'IconButton', 'Chip', 'Tab', 'Toggle', 'Switch', 'Slider',
  'Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback', 'Link',
])
const ROUND_BY_NATURE = new Set([
  'Avatar', 'AvatarImage', 'AvatarFallback', 'Dot', 'StatusDot', 'Ring', 'ProgressRing',
  'Spinner', 'Skeleton', 'OrbitMark', 'AstraGlyph', 'AstraMark',
])

// Only a real activation handler or a link target proves a control. Every `onX` prop is too
// broad (onLayout, onLoad, onChange on a wrapper are lifecycle, not activation), and a bare
// `role` is often static semantics such as role="status".
const ACTIVATION = new Set([
  'onClick', 'onPress', 'onPressIn', 'onLongPress', 'onKeyDown', 'onKeyUp', 'onMouseDown', 'onTouchEnd',
])
const INTERACTIVE_ROLE = new Set(['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio', 'switch', 'option'])
const isInteractive = (node) =>
  node.attributes.some((a) => {
    if (a.type !== 'JSXAttribute') return false
    const name = a.name?.name
    if (name === 'href') return true
    if (ACTIVATION.has(name)) return true
    if (name !== 'role') return false
    const value = a.value?.type === 'Literal' ? a.value.value : null
    return typeof value === 'string' && INTERACTIVE_ROLE.has(value)
  })

// A pill radius arrives three ways: a number, a '999px' string, and the token member the mobile
// styles use, `radius.full` / `radii.pill`.
const PILL_TOKEN = /^(?:radius|radii|borderRadius)$/i
const PILL_TOKEN_PROP = /^(?:full|pill|round|circle)$/i
function isPillRadius(value) {
  if (!value) return false
  if (value.type === 'Literal' && typeof value.value === 'number') return value.value >= 999
  if (value.type === 'MemberExpression') {
    const object = value.object?.name
    const prop = value.property?.name ?? value.property?.value
    return typeof object === 'string' && typeof prop === 'string' && PILL_TOKEN.test(object) && PILL_TOKEN_PROP.test(prop)
  }
  return collectStaticStrings(value).some((s) => /^\s*(?:999|9999)(?:px|rem)?\s*$/.test(s))
}

// Equal source text only proves a circle for an ABSOLUTE size. width: '100%' and height: '100%'
// fill a rectangular parent, so they are not evidence of roundness.
const RELATIVE_SIZE = /%|v[wh]|auto|inherit/i

/**
 * True only for a child expression whose value IS text. Counting every nonempty expression
 * container reported `{icon}` and `{ready && <Icon />}`, which are round icon wrappers rather
 * than chips, so the discriminator that was supposed to separate a pill from a circle stopped
 * separating anything. An ambiguous expression is left alone on purpose.
 */
const isProvablyText = (node) => {
  if (!node) return false
  if (node.type === 'Literal') return typeof node.value === 'string' || typeof node.value === 'number'
  if (node.type === 'TemplateLiteral') return true
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    return isProvablyText(node.left) || isProvablyText(node.right)
  }
  if (node.type === 'ConditionalExpression') {
    return isProvablyText(node.consequent) && isProvablyText(node.alternate)
  }
  return false
}

const unwrap = (node) =>
  node && (node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression') ? unwrap(node.expression) : node

/** The initializer a name was bound to in this file, or null when it is not a local `const`. */
function bindingInit(name, scope) {
  for (let current = scope; current; current = current.upper) {
    const variable = current.variables.find((candidate) => candidate.name === name)
    if (!variable) continue
    const definition = variable.defs.at(-1)
    if (definition?.type !== 'Variable' || definition.node.type !== 'VariableDeclarator') return null
    return unwrap(definition.node.init)
  }
  return null
}

/** `StyleSheet.create({ ... })` carries its styles in the first argument; a plain object is itself. */
function styleObjectOf(node) {
  const value = unwrap(node)
  if (value?.type !== 'CallExpression') return value
  const callee = value.callee
  const isCreate =
    callee?.type === 'MemberExpression' && (callee.property?.name ?? callee.property?.value) === 'create'
  return isCreate ? unwrap(value.arguments[0]) : null
}

/**
 * Every style Property an element actually applies, following a reference such as
 * `styles.badge` back to its literal. Resolution runs from the ELEMENT, so the consumer
 * that decides whether a pill is legitimate is always in hand.
 */
function collectAppliedStyleProperties(node, sourceCode) {
  const attribute = getAttribute(node, 'style')
  if (!attribute) return []

  const found = []
  const seen = new Set()

  const walk = (current, scope) => {
    const value = unwrap(current)
    if (!value || seen.has(value)) return
    seen.add(value)

    if (value.type === 'Identifier') {
      walk(bindingInit(value.name, scope), scope)
      return
    }
    if (value.type === 'MemberExpression') {
      // `styles.badge`: resolve the object, then take the one entry the element names.
      const root = unwrap(value.object)
      if (root?.type !== 'Identifier' || value.computed) return
      const key = value.property?.name ?? value.property?.value
      const object = styleObjectOf(bindingInit(root.name, scope))
      if (object?.type !== 'ObjectExpression' || typeof key !== 'string') return
      const entry = object.properties.find(
        (property) => property.type === 'Property' && getPropertyKeyName(property) === key,
      )
      walk(entry?.value, scope)
      return
    }
    if (value.type === 'ArrayExpression') {
      for (const element of value.elements) walk(element, scope)
      return
    }
    if (value.type === 'LogicalExpression') {
      walk(value.left, scope)
      walk(value.right, scope)
      return
    }
    if (value.type === 'ConditionalExpression') {
      walk(value.consequent, scope)
      walk(value.alternate, scope)
      return
    }
    if (value.type === 'ObjectExpression') {
      for (const property of collectObjectProperties(value)) found.push(property)
    }
  }

  walk(getAttributeValueNode(attribute), sourceCode.getScope(node))
  return found
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban a pill radius on a static element (DESIGN.md: radius 999 belongs to the interactive kit).',
    },
    schema: [],
    messages: {
      pillOnStatic:
        'A pill radius on a static element promises a press that is not there. DESIGN.md keeps radius 999 to `PillButton` and the interactive kit, and "Surface rules" requires controls and content to stay distinct. Use the surface radius, or make this a real control.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = getElementName(node)
        if (!name || INTERACTIVE.has(name) || ROUND_BY_NATURE.has(name)) return
        if (isInteractive(node)) return

        const styleProperties = collectAppliedStyleProperties(node, context.sourceCode)

        let pill = PILL_CLASS_RE.test(getClassText(node) ?? '')
        if (!pill) {
          for (const property of styleProperties) {
            const key = getPropertyKeyName(property)
            if (!key || !RADIUS_KEYS.has(key)) continue
            if (isPillRadius(property.value)) pill = true
          }
        }

        if (!pill) return
        // A skeleton is deliberately shaped like the thing it stands in for.
        if (/(?:^|\s)animate-pulse(?:\s|$)/.test(getClassText(node) ?? '')) return
        // A circle is not a pill. Equal width and height is a round shape by design, and that
        // holds for a DYNAMIC size too: an avatar sized `width: size, height: size` is a circle
        // at every value of `size`, so the two are compared by source text rather than by literal.
        let width = null
        let height = null
        for (const property of styleProperties) {
          const key = getPropertyKeyName(property)
          if (key !== 'width' && key !== 'height') continue
          const text = context.sourceCode.getText(property.value)
          if (key === 'width') width = text
          else height = text
        }
        if (width !== null && width === height && !RELATIVE_SIZE.test(width)) return
        // Only a pill carrying TEXT reads as a chip. An icon inside a circle does not.
        const children = node.parent?.children ?? []
        const carriesText = children.some(
          (child) =>
            (child.type === 'JSXText' && child.value.trim() !== '') ||
            (child.type === 'JSXExpressionContainer' && isProvablyText(child.expression)) ||
            // React Native always wraps a label in <Text>, so that child IS the text.
            (child.type === 'JSXElement' && TEXT_ELEMENTS.has(getElementName(child.openingElement))),
        )
        if (!carriesText) return
        context.report({ node, messageId: 'pillOnStatic' })
      },
    }
  },
}
