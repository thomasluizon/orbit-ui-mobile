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
 * Also checks four-number arrays and numeric arguments to `.bezier(...)`.
 */

const CUBIC_BEZIER_RE = /cubic-bezier\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g

function numericLiteral(node) {
  if (node?.type === 'Literal' && typeof node.value === 'number') return node.value
  if (node?.type === 'UnaryExpression' && (node.operator === '-' || node.operator === '+') &&
      node.argument.type === 'Literal' && typeof node.argument.value === 'number') {
    return node.operator === '-' ? -node.argument.value : node.argument.value
  }
  return null
}

function hasOvershoot(y1, y2) {
  return y1 < 0 || y1 > 1 || y2 < 0 || y2 > 1
}

function findOvershoot(text) {
  for (const match of text.matchAll(CUBIC_BEZIER_RE)) {
    const [, , y1, , y2] = match.map(Number)
    if (Number.isNaN(y1) || Number.isNaN(y2)) continue
    if (hasOvershoot(y1, y2)) return match[0]
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
    function checkControls(node, controls) {
      if (controls.length !== 4) return
      const values = controls.map(numericLiteral)
      if (values.some((value) => value === null)) return
      if (hasOvershoot(values[1], values[3])) {
        context.report({ node, messageId: 'noOvershoot', data: { curve: context.sourceCode.getText(node) } })
      }
    }

    function check(node, text) {
      const curve = findOvershoot(text)
      if (curve) {
        context.report({ node, messageId: 'noOvershoot', data: { curve: curve.replace(/_/g, ' ') } })
      }
    }

    return {
      ArrayExpression(node) {
        checkControls(node, node.elements)
      },
      CallExpression(node) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression') return
        const property = callee.property
        if ((!callee.computed && property.type === 'Identifier' && property.name === 'bezier') ||
            (callee.computed && property.type === 'Literal' && property.value === 'bezier')) {
          checkControls(node, node.arguments)
        }
      },
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
