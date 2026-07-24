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
 *  - a hand-rolled glow: any `shadow-[...]` / `boxShadow` value that is not inset,
 *    has a non-zero BLUR, and carries a HUE;
 *  - `glow` on <PillButton> unless explicitly `glow={false}`.
 *
 * The hue test, not a token list, is the rule. DESIGN.md:177: shadows "model real
 * occlusion under a lifted surface... they are never a depth decoration and never
 * carry the accent hue." Every sanctioned shadow (sh-1/sh-2/sh-3, the hairline
 * ring) is pure greyscale, so "shadow with a hue" IS "decorative glow" and needs
 * no enumeration. The previous version tested for `--primary-rgb` specifically,
 * which is why a `color-mix(in srgb, var(--status-frozen) 40%, transparent)` glow
 * shipped in the very PR that bans glow (#560, caught by a reviewer, not by this).
 * Any semantic token, named hue, hsl/oklch function or non-grey rgb/hex counts.
 *
 * An INSET ring is not a glow (`shadow-[inset_0_0_0_1.5px_var(--primary)]` is the
 * sanctioned selected-card treatment), and neither is a zero-blur ring or hairline
 * (`0 0 0 0.5px rgba(255,255,255,.06)`) - the blur is the third length.
 *
 * SCOPE LIMIT (mobile): an ad-hoc RN glow assembled from raw shadow primitives
 * (`shadowColor: tokens.primary` + `shadowRadius` + `shadowOpacity`) is still not
 * matched — a bare colour carries no blur, so it cannot be told from a legitimate
 * elevation shadow without resolving the value. `primaryGlow()` is the canonical
 * seam. Shadow properties are now read in ANY object, not only a JSX `style`
 * attribute, so `StyleSheet.create({ })` and module-level style objects are
 * covered where they were previously invisible.
 */

const { collectStaticStrings, getAttribute, getAttributeValueNode, getElementName, getPropertyKeyName } = require('./_jsx-strings.cjs')

const GLOW_TOKEN_RE = /--primary-glow/
const GLOW_HELPERS = new Set(['primaryGlow', 'primaryGlowHover'])
const SHADOW_CLASS_RE = /shadow-\[([^\]]+)\]/g
const SHADOW_STYLE_KEYS = new Set(['boxShadow', 'shadowColor', 'shadowOpacity', 'shadowRadius'])

const LENGTH_RE = /(-?\d*\.?\d+)(px|rem|em)?/g
const NEUTRAL_NAMES = new Set(['transparent', 'black', 'white', 'none', 'currentcolor', 'inherit', 'initial', 'unset'])
const HUE_FUNCTION_RE = /\b(hsla?|oklch|oklab|lch|lab)\s*\(/
// Only the hues a glow would plausibly reach for. A full CSS colour list would
// false-fire on ordinary identifiers appearing inside a shadow expression.
const CSS_NAMED_COLORS = new Set([
  'red', 'blue', 'green', 'purple', 'violet', 'indigo', 'magenta', 'cyan', 'teal', 'orange',
  'yellow', 'pink', 'gold', 'lime', 'aqua', 'fuchsia', 'maroon', 'navy', 'olive', 'silver',
])

/** The blur is the THIRD length in a shadow value. A ring or hairline has blur 0; only a blurred shadow can glow. */
function blurRadius(value) {
  const lengths = String(value).slice(0, value.indexOf('(') === -1 ? undefined : value.indexOf('(')).match(LENGTH_RE)
  if (!lengths || lengths.length < 3) return 0
  return Math.abs(Number.parseFloat(lengths[2])) || 0
}

/**
 * DESIGN.md:177 - shadows "model real occlusion under a lifted surface... they are
 * never a depth decoration and never carry the accent hue." So the test is not
 * which token was used, it is whether the shadow carries a HUE at all. Every
 * sanctioned shadow (sh-1/sh-2/sh-3, the hairline ring) is pure greyscale.
 */
function hasNonNeutralColor(value) {
  const text = String(value).toLowerCase()
  if (/var\(\s*--/.test(text) || /color-mix\s*\(/.test(text)) return true
  for (const match of text.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    const [red, green, blue] = [match[1], match[2], match[3]].map(Number)
    if (red !== green || green !== blue) return true
  }
  for (const match of text.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/g)) {
    const hex = match[1]
    const pairs =
      hex.length === 3 ? [...hex].map((char) => char + char) : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)]
    if (pairs[0] !== pairs[1] || pairs[1] !== pairs[2]) return true
  }
  if (HUE_FUNCTION_RE.test(text)) return true
  for (const word of text.matchAll(/\b([a-z]{3,20})\b/g)) {
    const name = word[1]
    if (NEUTRAL_NAMES.has(name)) continue
    if (CSS_NAMED_COLORS.has(name)) return true
  }
  return false
}

function isGlowShadowValue(value) {
  if (/\binset\b/.test(value)) return false
  if (blurRadius(value) <= 0) return false
  return hasNonNeutralColor(value)
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

      },
      /**
       * Any shadow property in any object, not only a JSX `style` attribute. The
       * previous version read `style={{ }}` alone, so a glow inside
       * `StyleSheet.create({ })` or a module-level style object was never visited
       * at all - the whole mobile surface was blind to this rule.
       */
      Property(node) {
        const key = getPropertyKeyName(node)
        if (!key || !SHADOW_STYLE_KEYS.has(key)) return
        const strings = collectStaticStrings(node.value)
        if (strings.some((value) => GLOW_TOKEN_RE.test(value))) return
        if (strings.some((value) => isGlowShadowValue(value))) {
          context.report({ node, messageId: 'noHandRolledGlow' })
        }
      },
    }
  },
}
