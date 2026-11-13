const { getElementName } = require('./_jsx-strings.cjs')

const SPINNER_NAMES = new Set([
  'ActivityIndicator',
  'Loader',
  'Loader2',
  'LoaderCircle',
  'Loader2Icon',
  'LoaderCircleIcon',
  'IconLoader',
  'IconLoader2',
  'IconLoader3',
  'IconLoaderQuarter',
])
const SPIN_CLASS_RE = /(?:^|[\s:])animate-(?:spin(?![\w-])|\[spin)/

function spinnerName(name) {
  if (!name) return null
  const last = name.split('.').pop()
  return SPINNER_NAMES.has(last) ? last : null
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban every spinner (DESIGN.md Bans: no spinner). Loading content shows a skeleton; a waiting control shows `SkeletonFace`.',
    },
    schema: [],
    messages: {
      noSpinner:
        'A spinner is banned (DESIGN.md "Bans"). Content that loads shows a `Skeleton` shaped like its final layout; a control that waits keeps its label, is disabled and busy, and shows `SkeletonFace`.',
    },
  },
  create(context) {
    const reportClass = (node, value) => {
      if (typeof value === 'string' && SPIN_CLASS_RE.test(value)) context.report({ node, messageId: 'noSpinner' })
    }
    return {
      ImportDeclaration(node) {
        for (const specifier of node.specifiers) {
          if (spinnerName(specifier.imported?.name ?? specifier.local?.name)) context.report({ node: specifier, messageId: 'noSpinner' })
        }
      },
      JSXOpeningElement(node) {
        if (spinnerName(getElementName(node))) context.report({ node, messageId: 'noSpinner' })
      },
      MemberExpression(node) {
        if (!node.computed && node.property.type === 'Identifier' && node.property.name === 'ActivityIndicator') context.report({ node, messageId: 'noSpinner' })
      },
      Literal(node) {
        reportClass(node, node.value)
      },
      TemplateElement(node) {
        reportClass(node, node.value.cooked)
      },
    }
  },
}
