/**
 * Local ESLint rule: never disable pinch-zoom.
 *
 * WCAG 1.4.4. `user-scalable=no` / `maximum-scale=1` locks a low-vision user out
 * of the only magnification they have. DESIGN.md's fixed-412px mobile shell makes
 * pinning the viewport a live temptation — if the layout breaks at 200% zoom, the
 * layout is the bug.
 *
 * Matches both spellings the web app can use:
 *  - a raw `<meta name="viewport" content="...">` string, and
 *  - Next.js's `export const viewport = { userScalable: false, maximumScale: 1 }`
 *    (`app/layout.tsx`), which is the form this repo actually ships.
 *
 * Web only — `apps/mobile` has no viewport.
 */

const { collectObjectProperties, collectStaticStrings, getAttribute, getAttributeValueNode, getElementName, getPropertyKeyName } = require('./_jsx-strings.cjs')

const VIEWPORT_CONTENT_RE = /user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*1(?:\.0+)?(?:\s|,|;|$)/

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban user-scalable=no / maximum-scale=1 — never disable pinch-zoom (WCAG 1.4.4).',
    },
    schema: [],
    messages: {
      noZoomLock:
        'Disabling pinch-zoom locks out low-vision users (WCAG 1.4.4). Drop `{{token}}` — if the layout breaks at 200% zoom, fix the layout rather than pinning the viewport.',
    },
  },
  create(context) {
    function checkViewportObject(node) {
      for (const property of collectObjectProperties(node)) {
        const key = getPropertyKeyName(property)
        const value = property.value
        if (key === 'userScalable' && value.type === 'Literal' && value.value === false) {
          context.report({ node: property, messageId: 'noZoomLock', data: { token: 'userScalable: false' } })
        }
        if (key === 'maximumScale' && value.type === 'Literal' && value.value === 1) {
          context.report({ node: property, messageId: 'noZoomLock', data: { token: 'maximumScale: 1' } })
        }
      }
    }

    return {
      JSXOpeningElement(node) {
        if (getElementName(node) !== 'meta') return
        const nameAttribute = getAttribute(node, 'name')
        const nameValue = nameAttribute?.value
        if (!nameValue || nameValue.type !== 'Literal' || nameValue.value !== 'viewport') return

        const contentAttribute = getAttribute(node, 'content')
        if (!contentAttribute) return
        const text = collectStaticStrings(getAttributeValueNode(contentAttribute)).join(' ')
        const match = VIEWPORT_CONTENT_RE.exec(text)
        if (match) {
          context.report({ node: contentAttribute, messageId: 'noZoomLock', data: { token: match[0].trim() } })
        }
      },
      ExportNamedDeclaration(node) {
        const declaration = node.declaration
        if (!declaration || declaration.type !== 'VariableDeclaration') return
        for (const declarator of declaration.declarations) {
          if (declarator.id.type !== 'Identifier' || declarator.id.name !== 'viewport') continue
          checkViewportObject(declarator.init)
        }
      },
    }
  },
}
