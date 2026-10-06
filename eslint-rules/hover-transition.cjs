const { collectStaticStrings, getAttributeValueNode } = require('./_jsx-strings.cjs')

const HOVER_FILL = /(?:^|:)(?:hover|group-hover(?:\/[^:]+)?):bg-/
const TRANSITION = /(?:^|:)(?:!?transition(?:-[\w-]+|-\[[^\]]+\])?|\[transition-property:[^\]]+\])(?:!)?$/
const HOVER_VARIANT = /(?:^|:)(?:hover|group-hover(?:\/[^:]+)?):/
const MOTION = /^(?:habit-control-motion|orbit-pill-action|orbit-list-row[\w-]*|orbit-menu-item|chip)$/

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Require a base transition for hover fills or an explicit instant-fill exception.' },
    schema: [],
    messages: { missing: 'Hover fills need a base transition utility, a motion class, or explicit transition-none.' },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.name !== 'className') return
        const classes = collectStaticStrings(getAttributeValueNode(node)).join(' ').split(/\s+/)
        if (!classes.some((name) => HOVER_FILL.test(name))) return
        if (classes.some((name) => MOTION.test(name) || (TRANSITION.test(name) && !HOVER_VARIANT.test(name)))) return
        context.report({ node, messageId: 'missing' })
      },
    }
  },
}
