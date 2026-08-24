/**
 * Local ESLint rule: no `oklch()` in a shared token or a mobile style.
 *
 * DESIGN.md "Enforcement" lists this as a gate. `oklch()` is a CSS colour
 * function: the web stylesheet resolves it, React Native's style engine does
 * not, and `packages/shared` is consumed by both. An `oklch()` literal that
 * reaches either one renders as an invalid colour rather than failing loudly.
 *
 * DESIGN.md derives the palette in OKLCH deliberately ("move the OKLCH L channel
 * only"), so the function is correct in `apps/web` CSS. This rule bans it
 * everywhere that is not that: shared packages and both mobile source trees.
 */

const OKLCH_RE = /\boklch\s*\(/i

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban `oklch()` in shared tokens and mobile styles, where it does not resolve.',
    },
    schema: [],
    messages: {
      noOklch:
        '`oklch()` does not resolve here. React Native cannot parse it and `packages/shared` feeds both platforms, so this renders as an invalid colour. Emit a hex or rgb value, and keep OKLCH derivation in the web stylesheet.',
    },
  },
  create(context) {
    const report = (node, raw) => {
      if (typeof raw === 'string' && OKLCH_RE.test(raw)) {
        context.report({ node, messageId: 'noOklch' })
      }
    }
    return {
      Literal(node) {
        report(node, node.value)
      },
      TemplateElement(node) {
        report(node, node.value?.cooked ?? node.value?.raw)
      },
    }
  },
}
