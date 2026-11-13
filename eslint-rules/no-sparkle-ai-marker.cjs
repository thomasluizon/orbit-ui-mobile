const { getElementName } = require('./_jsx-strings.cjs')

const SPARKLE_NAMES = new Set(['Sparkle', 'Sparkles', 'IconSparkles', 'IconSparkle', 'SparklesIcon'])
const SPARKLE_EMOJI_RE = /[✨\u{1F31F}\u{1FA84}]/u

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban the sparkle icon as an AI marker (DESIGN.md: the AI is Orbit, and its marker is the mascot).',
    },
    schema: [],
    messages: {
      noSparkle:
        'The sparkle is banned as an AI marker (DESIGN.md "Bans"). The AI is Orbit, and `OrbitMascot` marks it; identity comes from the mascot and ring indicators and from nothing else.',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        for (const specifier of node.specifiers) {
          const imported = specifier.imported?.name ?? specifier.local?.name
          if (imported && SPARKLE_NAMES.has(imported)) {
            context.report({ node: specifier, messageId: 'noSparkle' })
          }
        }
      },
      JSXOpeningElement(node) {
        const name = getElementName(node)
        if (name && SPARKLE_NAMES.has(name)) {
          context.report({ node, messageId: 'noSparkle' })
        }
      },
      JSXText(node) {
        if (SPARKLE_EMOJI_RE.test(node.value)) {
          context.report({ node, messageId: 'noSparkle' })
        }
      },
    }
  },
}
