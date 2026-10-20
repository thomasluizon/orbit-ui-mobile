const { collectStaticStrings, getAttribute, getAttributeValueNode, getElementName, getPropertyKeyName } = require('./_jsx-strings.cjs')

const GRADIENT_TOKEN_RE = /--gradient-header|\bgradientHeader\b|\bgradientHeaderFrom\b/
const GRADIENT_FUNCTION_RE = /(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/
const GRADIENT_CLASS_RE = /(?:^|\s|:)(bg-gradient-to-[trbl]{1,2}|bg-linear-(?:to-[trbl]{1,2}|\d+|\[[^\]]+\]))(?:\s|$)/
const GRADIENT_ELEMENTS = new Set([
  'GradientTop',
  'LinearGradient',
  'RadialGradient',
  'linearGradient',
  'radialGradient',
])
const GRADIENT_MODULES = new Set(['expo-linear-gradient', 'react-native-linear-gradient'])
const MASK_KEY_RE = /mask/i
const OPAQUE_CARD_LAYER = 'linear-gradient(var(--bg-card), var(--bg-card))'

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban decorative gradients (DESIGN.md "Bans": no gradient wash, borders, text, mesh or texture).',
    },
    schema: [],
    messages: {
      noGradientToken:
        'The `{{token}}` gradient token is deleted (DESIGN.md "Bans": no gradient wash). The canvas is a flat surface.',
      noGradientFunction:
        'DESIGN.md "Bans": no decorative gradient of any kind. Use a flat semantic surface token (`--bg`, `--bg-elev`) or an inset hairline ring instead.',
      noGradientClass:
        'DESIGN.md "Bans": no decorative gradient of any kind. Drop `{{token}}` and use a flat semantic surface token.',
      noGradientElement:
        '<{{name}}> paints a decorative gradient (DESIGN.md "Bans": no gradient wash — GradientTop is deleted). Render a flat surface instead.',
      noGradientImport:
        "Don't import '{{module}}' (DESIGN.md \"Bans\": no decorative gradient of any kind).",
    },
  },
  create(context) {
    function isInsideMaskProperty(node) {
      let current = node.parent
      while (current) {
        if (current.type === 'Property') {
          const key = getPropertyKeyName(current)
          if (key && MASK_KEY_RE.test(key)) return true
        }
        current = current.parent
      }
      return false
    }

    function isOpaqueCardLayer(node, value) {
      if (value !== OPAQUE_CARD_LAYER) return false
      const property = node.parent
      if (property?.type !== 'Property' || getPropertyKeyName(property) !== 'backgroundImage') {
        return false
      }
      const styleObject = property.parent
      if (styleObject?.type !== 'ObjectExpression') return false
      return styleObject.properties.some(
        (candidate) =>
          candidate.type === 'Property' &&
          getPropertyKeyName(candidate) === 'backgroundColor' &&
          candidate.value.type === 'Literal' &&
          candidate.value.value === 'var(--bg)',
      )
    }

    function isFunctionalGradient(node, value) {
      return isInsideMaskProperty(node) || isOpaqueCardLayer(node, value)
    }

    function reportSource(node, moduleName) {
      if (GRADIENT_MODULES.has(moduleName)) {
        context.report({ node, messageId: 'noGradientImport', data: { module: moduleName } })
      }
    }

    return {
      ImportDeclaration(node) {
        reportSource(node.source, node.source.value)
      },
      Literal(node) {
        if (typeof node.value !== 'string') return
        const tokenMatch = GRADIENT_TOKEN_RE.exec(node.value)
        if (tokenMatch) {
          context.report({ node, messageId: 'noGradientToken', data: { token: tokenMatch[0] } })
          return
        }
        if (GRADIENT_FUNCTION_RE.test(node.value) && !isFunctionalGradient(node, node.value)) {
          context.report({ node, messageId: 'noGradientFunction' })
        }
      },
      TemplateLiteral(node) {
        const text = node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw ?? '').join(' ')
        const tokenMatch = GRADIENT_TOKEN_RE.exec(text)
        if (tokenMatch) {
          context.report({ node, messageId: 'noGradientToken', data: { token: tokenMatch[0] } })
          return
        }
        if (GRADIENT_FUNCTION_RE.test(text) && !isFunctionalGradient(node, text)) {
          context.report({ node, messageId: 'noGradientFunction' })
        }
      },
      JSXOpeningElement(node) {
        const elementName = getElementName(node)
        if (elementName && GRADIENT_ELEMENTS.has(elementName)) {
          context.report({ node, messageId: 'noGradientElement', data: { name: elementName } })
        }

        const classAttribute = getAttribute(node, 'className')
        if (!classAttribute) return
        const text = collectStaticStrings(getAttributeValueNode(classAttribute)).join(' ')
        const classMatch = GRADIENT_CLASS_RE.exec(text)
        if (classMatch) {
          context.report({ node: classAttribute, messageId: 'noGradientClass', data: { token: classMatch[1] } })
        }
      },
    }
  },
}
