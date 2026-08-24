/**
 * Local ESLint rule: a fully rounded radius belongs to the interactive kit.
 *
 * DESIGN.md "Enforcement" lists this as a gate: radius 999 outside `PillButton`
 * and the interactive kit. A pill silhouette reads as "you can press this", so
 * putting it on a static element promises an affordance that is not there, and
 * DESIGN.md "Surface rules" already requires controls and content to stay
 * distinct in both directions.
 *
 * Reported only when the element carries TEXT and is not a circle, because that is
 * what separates a pill from a round shape. A labelled, fully-rounded box is a chip
 * and promises a press. A circle is not a pill: an icon in a 56x56 rounded-full box,
 * an avatar, a dot, a ring indicator and a skeleton bar are all round by design and
 * promise nothing. DESIGN.md wants those round.
 *
 * Badge is deliberately NOT exempt. DESIGN.md gives a badge radius 8 and reserves
 * 999 to the interactive kit, so a fully-rounded badge is the defect this catches,
 * not an exception to it.
 */

const { getClassText, getElementName, collectStaticStrings, collectStyleProperties, getPropertyKeyName } = require('./_jsx-strings.cjs')

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

const isInteractive = (node) => {
  if (node.attributes.some((a) => a.type === 'JSXAttribute' && /^on[A-Z]/.test(a.name?.name ?? ''))) return true
  return node.attributes.some((a) => a.type === 'JSXAttribute' && (a.name?.name === 'href' || a.name?.name === 'role'))
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

        let pill = PILL_CLASS_RE.test(getClassText(node) ?? '')
        if (!pill) {
          for (const property of collectStyleProperties(node)) {
            const key = getPropertyKeyName(property)
            if (!key || !RADIUS_KEYS.has(key)) continue
            const value = property.value
            if (value?.type === 'Literal' && typeof value.value === 'number' && value.value >= 999) pill = true
            if (collectStaticStrings(value).some((s) => /^\s*(?:999|9999)(?:px|rem)?\s*$/.test(s))) pill = true
          }
        }

        if (!pill) return
        // A skeleton is deliberately shaped like the thing it stands in for.
        if (/(?:^|\s)animate-pulse(?:\s|$)/.test(getClassText(node) ?? '')) return
        // A circle is not a pill. Equal width and height is a round shape by design.
        let width = null
        let height = null
        for (const property of collectStyleProperties(node)) {
          const key = getPropertyKeyName(property)
          const value = property.value
          if (value?.type !== 'Literal' || typeof value.value !== 'number') continue
          if (key === 'width') width = value.value
          if (key === 'height') height = value.value
        }
        if (width !== null && width === height) return
        // Only a pill carrying TEXT reads as a chip. An icon inside a circle does not.
        const children = node.parent?.children ?? []
        const carriesText = children.some(
          (child) =>
            (child.type === 'JSXText' && child.value.trim() !== '') ||
            (child.type === 'JSXExpressionContainer' && child.expression?.type !== 'JSXEmptyExpression') ||
            // React Native always wraps a label in <Text>, so that child IS the text.
            (child.type === 'JSXElement' && TEXT_ELEMENTS.has(getElementName(child.openingElement))),
        )
        if (!carriesText) return
        context.report({ node, messageId: 'pillOnStatic' })
      },
    }
  },
}
