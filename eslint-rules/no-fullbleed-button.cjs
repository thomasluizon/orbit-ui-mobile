
const WIDTH_TOKEN_RE = /(?:^|\s)(w-full|flex-1)(?:\s|$)/
const PILL_RADIUS_RE = /rounded-full|rounded-\[999/
const CLASSED_ELEMENTS = new Set(['button', 'PillButton'])

function getElementName(node) {
  const name = node.name
  if (name && name.type === 'JSXIdentifier') return name.name
  return null
}

function collectStrings(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return [node.value]
  if (node.type === 'TemplateLiteral') {
    return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw ?? '')
  }
  return []
}

function findFullbleedPillToken(node) {
  const joined = collectStrings(node).join(' ')
  if (!PILL_RADIUS_RE.test(joined)) return null
  const match = WIDTH_TOKEN_RE.exec(joined)
  return match ? match[1] : null
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban full-bleed pill CTAs outside the DESIGN.md full-width allowlist.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          flagFullWidthProp: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noFullWidthProp:
        'Full-bleed pills read as AI slop (DESIGN.md "Buttons"). Drop `fullWidth` so the pill hugs its content, or — for a sanctioned context (mobile sheet/dialog primary action, <=mobile form submit, full-screen empty-state CTA) — exempt via the config path allowlist or an inline eslint-disable with a reason.',
      noFullWidthClass:
        'A `{{token}}` utility makes this button full-bleed (DESIGN.md "Buttons"). Let the pill hug its content, or — for a sanctioned full-width context — exempt via the config path allowlist or an inline eslint-disable with a reason.',
    },
  },
  create(context) {
    const options = context.options[0] ?? {}
    const flagFullWidthProp = options.flagFullWidthProp !== false

    return {
      JSXOpeningElement(node) {
        const elementName = getElementName(node)
        if (!elementName) return

        for (const attribute of node.attributes) {
          if (attribute.type !== 'JSXAttribute' || !attribute.name) continue
          const attrName = attribute.name.name

          if (flagFullWidthProp && elementName === 'PillButton' && attrName === 'fullWidth') {
            const value = attribute.value
            const isExplicitFalse =
              value != null &&
              value.type === 'JSXExpressionContainer' &&
              value.expression.type === 'Literal' &&
              value.expression.value === false
            if (!isExplicitFalse) {
              context.report({ node: attribute, messageId: 'noFullWidthProp' })
            }
            continue
          }

          if (attrName === 'className' && CLASSED_ELEMENTS.has(elementName)) {
            const value = attribute.value
            let target = null
            if (value != null && value.type === 'Literal') target = value
            else if (value != null && value.type === 'JSXExpressionContainer') target = value.expression
            const token = target ? findFullbleedPillToken(target) : null
            if (token) {
              context.report({ node: attribute, messageId: 'noFullWidthClass', data: { token } })
            }
          }
        }
      },
    }
  },
}
