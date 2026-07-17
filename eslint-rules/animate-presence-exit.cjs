/**
 * Local ESLint rule: every direct child of <AnimatePresence> defines `exit`.
 *
 * A SILENT failure — nothing errors, no warning fires, the element just vanishes
 * instantly while its siblings animate out. Stack-exact: apps/web depends on
 * `motion` ^12, apps/mobile mirrors it via Moti.
 *
 * Only DIRECT children are inspected, because only they are guaranteed to be
 * co-located with their AnimatePresence in one JSX tree.
 *
 * DELIBERATELY NOT IMPLEMENTED — the #539 spec's other half ("an `exit` prop with
 * no <AnimatePresence> ancestor"). It is unsound for this codebase and cannot be
 * made sound with static analysis. AnimatePresence must wrap the CONDITIONAL, so
 * the idiomatic composition puts it at the call site
 * (`<AnimatePresence>{open ? <Bar/> : null}</AnimatePresence>`) while the motion
 * element with `exit` lives inside `Bar` in another file. The ancestor is
 * therefore in a different module by design, and the check fired on exactly the
 * code that is written correctly: both hits in apps/web (`bulk-action-bar-v2`,
 * `notification-bell`) were properly wrapped at their call sites. A gate that
 * fires only on correct code trains people to disable it.
 */

const { getAttribute, getElementName } = require('./_jsx-strings.cjs')

const PRESENCE_ELEMENTS = new Set(['AnimatePresence'])
const MOTION_NAME_RE = /^(?:motion|m)\.|^Motion|^MotiView$|^MotiText$|^MotiImage$/

function isMotionElement(name) {
  return Boolean(name) && MOTION_NAME_RE.test(name)
}

function directChildElements(node) {
  const found = []
  const walk = (current) => {
    if (current == null || typeof current !== 'object') return
    if (Array.isArray(current)) {
      for (const item of current) walk(item)
      return
    }
    if (current.type === 'JSXElement') {
      found.push(current)
      return
    }
    if (current.type === 'JSXExpressionContainer') return walk(current.expression)
    if (current.type === 'ConditionalExpression') {
      walk(current.consequent)
      walk(current.alternate)
      return
    }
    if (current.type === 'LogicalExpression') return walk(current.right)
  }
  for (const child of node.children) walk(child)
  return found
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require an `exit` prop on every direct motion child of AnimatePresence.',
    },
    schema: [],
    messages: {
      presenceChildWithoutExit:
        '<{{name}}> is a direct child of <AnimatePresence> but defines no `exit` prop, so it disappears instantly instead of animating out. Add `exit` (mirroring `initial` for symmetry).',
    },
  },
  create(context) {
    return {
      JSXElement(node) {
        const name = getElementName(node.openingElement)
        if (!name || !PRESENCE_ELEMENTS.has(name)) return
        for (const child of directChildElements(node)) {
          const childName = getElementName(child.openingElement)
          if (!isMotionElement(childName)) continue
          if (getAttribute(child.openingElement, 'exit')) continue
          context.report({
            node: child.openingElement,
            messageId: 'presenceChildWithoutExit',
            data: { name: childName },
          })
        }
      },
    }
  },
}
