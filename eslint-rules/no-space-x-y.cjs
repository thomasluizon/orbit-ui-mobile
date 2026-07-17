/**
 * Local ESLint rule: no `space-x-*` / `space-y-*` utilities.
 *
 * DESIGN.md "Bans": no `space-x-*` / `space-y-*`; no margins for sibling spacing.
 * Use a flex/grid container with `gap-*` — `gap` also removes the margin-collapse
 * hacks the structural-hacks ban targets.
 *
 * Report-only, deliberately. The mechanical `space-y-4` -> `gap-4` swap is only
 * correct when the element is already a flex/grid container, which is not
 * statically decidable from the class string alone (the container may get its
 * display from a parent, a variant, or a `cn()` call this rule cannot see). An
 * autofix that adds `flex flex-col` would silently restyle the element. The
 * harvest table's "autofixable in the simple case" is therefore not implemented:
 * the simple case is not distinguishable from the unsafe one.
 */

const { collectStaticStrings, getAttribute, getAttributeValueNode } = require('./_jsx-strings.cjs')

const SPACE_CLASS_RE = /(?:^|\s|:)(space-[xy]-(?:\d+|px|\[[^\]]+\]))(?:\s|$)/

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban `space-x-*` / `space-y-*` utilities in favour of a `gap-*` container (DESIGN.md "Bans").',
    },
    schema: [],
    messages: {
      noSpaceUtility:
        '`{{token}}` spaces siblings with margins (DESIGN.md "Bans": no `space-x-*` / `space-y-*`). Make this a flex or grid container and use `gap-*`.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const classAttribute = getAttribute(node, 'className')
        if (!classAttribute) return
        const text = collectStaticStrings(getAttributeValueNode(classAttribute)).join(' ')
        const match = SPACE_CLASS_RE.exec(text)
        if (match) {
          context.report({ node: classAttribute, messageId: 'noSpaceUtility', data: { token: match[1] } })
        }
      },
    }
  },
}
