/**
 * Local ESLint rule: no decorative gradient of any kind.
 *
 * DESIGN.md "Bans": `--gradient-header` and `GradientTop` are deleted. No gradient
 * borders, no mesh, no bloom, no scanlines, no film grain, no "subtle texture".
 * Bundle 5 removes the call sites; this rule keeps them from coming back.
 *
 * Matched vectors:
 *  - the deleted `--gradient-header` / `--gradient-header-from` tokens and their
 *    mobile token-bag spelling (`gradientHeader`, `gradientHeaderFrom`);
 *  - a raw CSS gradient function (`linear-gradient(`, `radial-gradient(`,
 *    `conic-gradient(` and their `repeating-` forms) in any string;
 *  - Tailwind gradient utilities (`bg-gradient-to-*`, `bg-linear-*`, `from-*`/
 *    `via-*`/`to-*` colour stops) in a className;
 *  - `<LinearGradient>` (expo-linear-gradient) and `<GradientTop>` elements, plus
 *    imports of either module.
 *
 * MASK exemption: `-webkit-mask` / `mask` / `maskImage` use `radial-gradient()` as
 * a geometry primitive, not decoration (the sanctioned ring sweep is built this
 * way). A gradient inside a mask-valued style property is not reported.
 *
 * SCOPE LIMIT: ESLint sees only TS/TSX here, so gradients declared in
 * `app/globals.css` are NOT covered by this rule — the token deletion in bundle 5
 * is what removes those, and no lint gate re-guards the stylesheet.
 */

const { collectStaticStrings, getAttribute, getAttributeValueNode, getElementName, getPropertyKeyName } = require('./_jsx-strings.cjs')

const GRADIENT_TOKEN_RE = /--gradient-header|\bgradientHeader\b|\bgradientHeaderFrom\b/
const GRADIENT_FUNCTION_RE = /(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/
const GRADIENT_CLASS_RE = /(?:^|\s|:)(bg-gradient-to-[trbl]{1,2}|bg-linear-(?:to-[trbl]{1,2}|\d+|\[[^\]]+\]))(?:\s|$)/
const GRADIENT_ELEMENTS = new Set(['LinearGradient', 'GradientTop', 'RadialGradient'])
const GRADIENT_MODULES = new Set(['expo-linear-gradient', 'react-native-linear-gradient'])
const MASK_KEY_RE = /mask/i

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
        if (GRADIENT_FUNCTION_RE.test(node.value) && !isInsideMaskProperty(node)) {
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
        if (GRADIENT_FUNCTION_RE.test(text) && !isInsideMaskProperty(node)) {
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
