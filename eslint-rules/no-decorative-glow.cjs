/**
 * Local ESLint rule: keep decorative glow out of the UI.
 *
 * DESIGN.md "Bans": the primary-glow shadow token is deleted. Not on the CTA, not
 * on the FAB, not anywhere — a softened glow is still a glow. The token itself is
 * removed by bundle 5; this rule stops it being re-derived by hand from
 * `--primary-rgb` afterwards, which is the reintroduction vector a token deletion
 * alone cannot close.
 *
 * Four matched vectors:
 *  - a reference to the deleted `--primary-glow` / `--primary-glow-hover` CSS
 *    token (web);
 *  - a CALL to mobile's `primaryGlow()` / `primaryGlowHover()` token helper
 *    (`apps/mobile/lib/theme.ts`), which is how the same shadow is spelled on the
 *    RN side — an identifier, never a string, so the token regex cannot see it;
 *  - a hand-rolled accent glow: a `shadow-[...]` / `boxShadow` value combining a
 *    blur radius with `--primary-rgb` (`0 8px 28px rgba(var(--primary-rgb), .45)`)
 *    — the exact shape of the deleted token;
 *  - `glow` on <PillButton> unless explicitly `glow={false}`.
 *
 * An INSET ring is not a glow (`shadow-[inset_0_0_0_1.5px_var(--primary)]` is the
 * sanctioned selected-card treatment), so an inset-only shadow value is skipped.
 *
 * SCOPE LIMIT (mobile): an ad-hoc RN glow assembled from raw shadow primitives
 * (`shadowColor: tokens.primary` + `shadowRadius` + `shadowOpacity`) is not matched
 * — separating it from a legitimate elevation shadow needs the colour's resolved
 * value, which is not static here. `primaryGlow()` is the canonical seam and is
 * what apps/mobile actually uses; the raw-primitive form stays design-reviewer
 * judgement, exactly as mobile button width does for `local/no-fullbleed-button`.
 */

const { collectStaticStrings, collectStyleProperties, getAttribute, getAttributeValueNode, getElementName, getPropertyKeyName } = require('./_jsx-strings.cjs')

const GLOW_TOKEN_RE = /--primary-glow/
const GLOW_HELPERS = new Set(['primaryGlow', 'primaryGlowHover'])
const SHADOW_CLASS_RE = /shadow-\[([^\]]+)\]/g
const PRIMARY_RGB_RE = /--primary-rgb|primaryRgb/
const BLUR_RE = /\d+\s*px/
const SHADOW_STYLE_KEYS = new Set(['boxShadow', 'shadowColor', 'shadowOpacity', 'shadowRadius'])

function isGlowShadowValue(value) {
  if (!PRIMARY_RGB_RE.test(value)) return false
  if (!BLUR_RE.test(value)) return false
  return !/\binset\b/.test(value)
}

function findHandRolledGlow(text) {
  for (const match of text.matchAll(SHADOW_CLASS_RE)) {
    const value = match[1].replace(/_/g, ' ')
    if (isGlowShadowValue(value)) return match[0]
  }
  return null
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban decorative glow (DESIGN.md "Bans": the primary-glow token is deleted).',
    },
    schema: [],
    messages: {
      noGlowToken:
        'The `{{token}}` glow token is deleted (DESIGN.md "Bans": no decorative glow). Drop the shadow — a primary fill carries the CTA on its own.',
      noHandRolledGlow:
        'This re-derives the deleted glow token by hand from `--primary-rgb` (DESIGN.md "Bans": no decorative glow — a softened glow is still a glow). Drop the shadow, or use an inset hairline ring if the element needs an edge.',
      noGlowProp:
        'DESIGN.md "Bans": no decorative glow. Drop `glow` from <PillButton> (or pass `glow={false}`) — the primary fill is the emphasis.',
    },
  },
  create(context) {
    return {
      /** Mobile's token helper: `primaryGlow(tokens)` in a StyleSheet or style array. */
      CallExpression(node) {
        const callee = node.callee
        if (callee.type !== 'Identifier' || !GLOW_HELPERS.has(callee.name)) return
        context.report({ node, messageId: 'noGlowToken', data: { token: `${callee.name}()` } })
      },
      Literal(node) {
        if (typeof node.value !== 'string') return
        if (!GLOW_TOKEN_RE.test(node.value)) return
        context.report({ node, messageId: 'noGlowToken', data: { token: GLOW_TOKEN_RE.exec(node.value)[0] } })
      },
      TemplateLiteral(node) {
        const text = node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw ?? '').join(' ')
        if (!GLOW_TOKEN_RE.test(text)) return
        context.report({ node, messageId: 'noGlowToken', data: { token: GLOW_TOKEN_RE.exec(text)[0] } })
      },
      JSXOpeningElement(node) {
        const elementName = getElementName(node)

        if (elementName === 'PillButton') {
          const glowAttribute = getAttribute(node, 'glow')
          if (glowAttribute) {
            const value = glowAttribute.value
            const isExplicitFalse =
              value != null &&
              value.type === 'JSXExpressionContainer' &&
              value.expression.type === 'Literal' &&
              value.expression.value === false
            if (!isExplicitFalse) {
              context.report({ node: glowAttribute, messageId: 'noGlowProp' })
            }
          }
        }

        const classAttribute = getAttribute(node, 'className')
        if (classAttribute) {
          const text = collectStaticStrings(getAttributeValueNode(classAttribute)).join(' ')
          if (!GLOW_TOKEN_RE.test(text) && findHandRolledGlow(text)) {
            context.report({ node: classAttribute, messageId: 'noHandRolledGlow' })
          }
        }

        for (const property of collectStyleProperties(node)) {
          const key = getPropertyKeyName(property)
          if (!key || !SHADOW_STYLE_KEYS.has(key)) continue
          const strings = collectStaticStrings(property.value)
          if (strings.some((value) => GLOW_TOKEN_RE.test(value))) continue
          if (strings.some((value) => isGlowShadowValue(value))) {
            context.report({ node: property, messageId: 'noHandRolledGlow' })
          }
        }
      },
    }
  },
}
