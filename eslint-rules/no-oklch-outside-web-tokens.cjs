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
