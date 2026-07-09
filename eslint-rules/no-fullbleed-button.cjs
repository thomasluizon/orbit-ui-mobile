/**
 * Local ESLint rule: keep full-bleed pill CTAs out of non-sanctioned surfaces.
 *
 * DESIGN.md "Buttons": pills hug their content. Full-width is sanctioned ONLY in
 * (1) the single primary action of a mobile bottom-sheet / dialog, (2) a form
 * submit at <= the mobile breakpoint (auth / onboarding), and (3) a full-screen
 * empty-state primary CTA. `ConfirmDialog`'s paired action row is also allowed.
 * Those surfaces are exempted by `files`-scoped path globs in each workspace's
 * eslint config; a residual sanctioned case uses an inline
 * `eslint-disable-next-line local/no-fullbleed-button` with a reason.
 *
 * The rule flags two reintroduction vectors:
 *  - a `fullWidth` prop on <PillButton> (unless explicitly `fullWidth={false}`) —
 *    gated by the `flagFullWidthProp` option (default true). The web `PillButton`
 *    already self-caps `fullWidth` at the desktop breakpoint (`sm:max-w-[360px]
 *    sm:mx-auto`), so it can never full-bleed a desktop column; the web config
 *    therefore sets `flagFullWidthProp: false` and relies on the className check
 *    below. The mobile primitive has no desktop breakpoint, so mobile keeps the
 *    prop check on to enforce the DESIGN.md full-width allowlist.
 *  - a raw pill <button> (or <PillButton>) whose className string / template
 *    literal combines a pill radius (`rounded-full`) with a full-width utility
 *    (`w-full` / `flex-1`). The pill-radius requirement is deliberate: a
 *    full-width row, menu item, or card button (no pill radius) is legitimate
 *    layout, not a full-bleed CTA, so it is not flagged. This is the raw
 *    uncapped-pill vector (e.g. the pre-migration sidebar create button).
 *
 * Mobile StyleSheet width (`alignSelf: 'stretch'` / `width: '100%'`) cannot be
 * statically tied to a button here, so it is covered by the design-reviewer
 * checklist item instead of this rule.
 */

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
