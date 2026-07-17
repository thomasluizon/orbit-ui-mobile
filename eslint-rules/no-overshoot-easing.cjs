/**
 * Local ESLint rule: no bounce or elastic easing.
 *
 * DESIGN.md "Bans" + "Motion": no bounce or elastic easing — any `cubic-bezier`
 * whose y control points fall outside `[0,1]`. No spring overshoot. Four external
 * skills independently proposed overshoot during the #539 harvest and it was
 * dropped every time; the ban is the settled position.
 *
 * Only the y controls (the 2nd and 4th arguments) are checked. x controls outside
 * [0,1] are INVALID CSS, not overshoot, and are the browser's problem — reporting
 * them here would be a different rule wearing this one's message.
 *
 * Matches any `cubic-bezier(...)` with numeric literal arguments, wherever it
 * appears in a string: a Tailwind `ease-[cubic-bezier(...)]` arbitrary value, a
 * style object's `transitionTimingFunction`, or a shared motion-token value.
 */

const CUBIC_BEZIER_RE = /cubic-bezier\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g

function findOvershoot(text) {
  for (const match of text.matchAll(CUBIC_BEZIER_RE)) {
    const [, , y1, , y2] = match.map(Number)
    if (Number.isNaN(y1) || Number.isNaN(y2)) continue
    if (y1 < 0 || y1 > 1 || y2 < 0 || y2 > 1) return match[0]
  }
  return null
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban bounce/elastic easing — cubic-bezier y control points outside [0,1] (DESIGN.md "Motion").',
    },
    schema: [],
    messages: {
      noOvershoot:
        '`{{curve}}` overshoots: its y control points fall outside [0,1], which is bounce/elastic easing (DESIGN.md "Bans"). Use `--ease-out` for entrances or `--ease-standard` for state changes.',
    },
  },
  create(context) {
    function check(node, text) {
      const curve = findOvershoot(text)
      if (curve) {
        context.report({ node, messageId: 'noOvershoot', data: { curve: curve.replace(/_/g, ' ') } })
      }
    }

    return {
      Literal(node) {
        if (typeof node.value !== 'string') return
        check(node, node.value.replace(/_/g, ' '))
      },
      TemplateLiteral(node) {
        const text = node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw ?? '').join('')
        check(node, text.replace(/_/g, ' '))
      },
    }
  },
}
