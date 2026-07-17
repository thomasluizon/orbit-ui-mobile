/**
 * Local ESLint rule: express a typographic feature through its own CSS property.
 *
 * `font-variation-settings: "wght" 600` and `font-weight: 600` are not synonyms.
 * The raw-tag spelling only works while a VARIABLE font is rendering: when a
 * static fallback loads (offline, a failed fetch, a weight the family lacks), the
 * axis is ignored and the text silently renders at the wrong weight. The dedicated
 * property keeps working. Same for `font-feature-settings: "tnum" 1` versus
 * `font-variant-numeric: tabular-nums`, which DESIGN.md mandates for the numeric
 * roles.
 *
 * Only the tags with a dedicated property equivalent are banned. A genuine custom
 * axis with no property (`"GRAD"`, `"XTRA"`, a family's bespoke axis) has nowhere
 * else to go and is not reported.
 */

const TAG_TO_PROPERTY = new Map([
  ['wght', 'font-weight'],
  ['ital', 'font-style: italic'],
  ['slnt', 'font-style: oblique'],
  ['opsz', 'font-optical-sizing'],
  ['wdth', 'font-stretch'],
  ['tnum', 'font-variant-numeric: tabular-nums'],
  ['onum', 'font-variant-numeric: oldstyle-nums'],
  ['lnum', 'font-variant-numeric: lining-nums'],
  ['smcp', 'font-variant-caps: small-caps'],
  ['frac', 'font-variant-numeric: diagonal-fractions'],
  ['liga', 'font-variant-ligatures'],
  ['dlig', 'font-variant-ligatures: discretionary-ligatures'],
  ['kern', 'font-kerning'],
])

const { collectStaticStrings, getPropertyKeyName } = require('./_jsx-strings.cjs')

const SETTINGS_RE = /font-(?:variation|feature)-settings|fontVariationSettings|fontFeatureSettings/
const TAG_RE = /["'`]([a-zA-Z]{4})["'`]/g

/** The banned tag in a bare settings VALUE (`'"wght" 600'`), whose key was matched separately. */
function findTag(text) {
  for (const match of text.matchAll(TAG_RE)) {
    const tag = match[1].toLowerCase()
    if (TAG_TO_PROPERTY.has(tag)) return tag
  }
  return null
}

/** The banned tag in a string that carries the settings property AND the tag together. */
function findBannedTag(text) {
  if (!SETTINGS_RE.test(text)) return null
  return findTag(text)
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban raw font axis/feature tags where a dedicated CSS property exists.',
    },
    schema: [],
    messages: {
      rawTag:
        'Use `{{property}}` rather than the raw `"{{tag}}"` tag. The raw spelling only applies while a variable font is rendering — when a static fallback loads, the axis is ignored and the text silently renders wrong.',
    },
  },
  create(context) {
    function report(node, tag) {
      context.report({ node, messageId: 'rawTag', data: { tag, property: TAG_TO_PROPERTY.get(tag) } })
    }

    return {
      /** `fontVariationSettings: '"wght" 600'` — the key names the settings, the value carries the tag. */
      Property(node) {
        const key = getPropertyKeyName(node)
        if (!key || !SETTINGS_RE.test(key)) return
        const value = collectStaticStrings(node.value).join(' ')
        const tag = findTag(value)
        if (tag) report(node, tag)
      },
      /** A single string carrying both halves: a Tailwind arbitrary value or a raw CSS declaration. */
      Literal(node) {
        if (typeof node.value !== 'string') return
        if (node.parent && node.parent.type === 'Property' && SETTINGS_RE.test(getPropertyKeyName(node.parent) ?? '')) return
        const tag = findBannedTag(node.value)
        if (tag) report(node, tag)
      },
      TemplateLiteral(node) {
        const text = node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw ?? '').join(' ')
        const tag = findBannedTag(text)
        if (tag) report(node, tag)
      },
    }
  },
}
