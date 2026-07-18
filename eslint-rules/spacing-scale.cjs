/**
 * Local ESLint rule: every layout spacing value must sit on the DESIGN.md scale.
 *
 * DESIGN.md `### Spacing (base 4)` enumerates the only legal steps
 * (0 4 8 12 16 20 24 28 32 40 48 56 64 px). This gate reads spacing from the
 * three places it actually lives in Orbit — JSX inline `style={{ }}` objects,
 * React Native `StyleSheet.create({ })` objects, and Tailwind `className`
 * utilities (both scale steps and arbitrary `[13px]` values) — because a
 * CSS-only linter sees none of the first two.
 *
 * Scope: margin / padding (every side + logical + RN Horizontal/Vertical),
 * gap / rowGap / columnGap, and the positional insets. `width` / `height` are
 * deliberately NOT checked: an avatar diameter or a sheet height is a component
 * dimension, not layout rhythm, and folding them in would force an exemption
 * list wide enough to gut the gate.
 *
 * Autofix snaps a value to the nearest scale step ONLY when that step is unique,
 * within 1px, and non-zero. 13 -> 12 is mechanical; 10 -> 8-or-12 is a layout
 * decision and is reported unfixed. Snapping to 0 is never automatic because it
 * deletes spacing rather than correcting it.
 *
 * https://github.com/thomasluizon/orbit-ui-mobile/issues/539
 */

const DEFAULT_SCALE = [0, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64]

const INSET_PROPS = new Set([
  'top', 'right', 'bottom', 'left', 'start', 'end',
  'inset', 'insetInline', 'insetBlock',
  'insetInlineStart', 'insetInlineEnd', 'insetBlockStart', 'insetBlockEnd',
])

const BOX_PROPS = new Set([
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'marginInline', 'marginBlock', 'marginInlineStart', 'marginInlineEnd',
  'marginBlockStart', 'marginBlockEnd', 'marginHorizontal', 'marginVertical',
  'marginStart', 'marginEnd',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'paddingInline', 'paddingBlock', 'paddingInlineStart', 'paddingInlineEnd',
  'paddingBlockStart', 'paddingBlockEnd', 'paddingHorizontal', 'paddingVertical',
  'paddingStart', 'paddingEnd',
  'gap', 'rowGap', 'columnGap',
])

const SPACING_PROPS = new Set([...BOX_PROPS, ...INSET_PROPS])

const UTILITY_TO_PROP = new Map([
  ['p', 'padding'], ['px', 'paddingInline'], ['py', 'paddingBlock'],
  ['pt', 'paddingTop'], ['pr', 'paddingRight'], ['pb', 'paddingBottom'], ['pl', 'paddingLeft'],
  ['ps', 'paddingInlineStart'], ['pe', 'paddingInlineEnd'],
  ['m', 'margin'], ['mx', 'marginInline'], ['my', 'marginBlock'],
  ['mt', 'marginTop'], ['mr', 'marginRight'], ['mb', 'marginBottom'], ['ml', 'marginLeft'],
  ['ms', 'marginInlineStart'], ['me', 'marginInlineEnd'],
  ['gap', 'gap'], ['gap-x', 'columnGap'], ['gap-y', 'rowGap'],
  ['top', 'top'], ['right', 'right'], ['bottom', 'bottom'], ['left', 'left'],
  ['start', 'start'], ['end', 'end'],
  ['inset', 'inset'], ['inset-x', 'insetInline'], ['inset-y', 'insetBlock'],
])

const TAILWIND_STEP_PX = 4

const CLASS_TOKEN = /^(-?)([a-z]+(?:-[xy])?)-(\[[^\]]+\]|\d+(?:\.\d+)?)$/

function stripVariants(token) {
  let depth = 0
  let cut = -1
  for (let i = 0; i < token.length; i++) {
    const char = token[i]
    if (char === '[') depth++
    else if (char === ']') depth--
    else if (char === ':' && depth === 0) cut = i
  }
  return token.slice(cut + 1)
}

function pxFromArbitrary(raw) {
  const body = raw.slice(1, -1)
  if (/^-?\d+(\.\d+)?px$/.test(body)) return Number(body.slice(0, -2))
  if (/^-?\d+(\.\d+)?rem$/.test(body)) return Number(body.slice(0, -3)) * 16
  return null
}

function pxFromStyleValue(node) {
  if (node.type === 'Literal' && typeof node.value === 'number') return node.value
  if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number') {
    return -node.argument.value
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    const text = node.value.trim()
    if (/^-?\d+(\.\d+)?px$/.test(text)) return Number(text.slice(0, -2))
    if (/^-?\d+(\.\d+)?rem$/.test(text)) return Number(text.slice(0, -3)) * 16
  }
  return null
}

function propertyName(property) {
  if (property.type !== 'Property' || property.computed) return null
  if (property.key.type === 'Identifier') return property.key.name
  if (property.key.type === 'Literal') return String(property.key.value)
  return null
}

function isStyleSheetCreate(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.object.type === 'Identifier' &&
    node.callee.object.name === 'StyleSheet' &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'create'
  )
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require every margin/padding/gap/inset value to sit on the enumerated DESIGN.md spacing scale, across inline styles, StyleSheet.create, and Tailwind classes.',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          scale: { type: 'array', items: { type: 'number' } },
          allow: { type: 'array', items: { type: 'number' } },
          allowInsetHairline: { type: 'boolean' },
          exemptFiles: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      offScaleStyle:
        '{{value}}px is off the spacing scale ({{prop}}). DESIGN.md allows {{scale}}. Use {{nearest}}, or add a named exemption to the rule options — never widen the scale.',
      offScaleClass:
        '`{{token}}` resolves to {{value}}px, off the spacing scale. DESIGN.md allows {{scale}}. Use `{{suggestion}}`, or add a named exemption to the rule options — never widen the scale.',
    },
  },
  create(context) {
    const options = context.options[0] ?? {}
    const scale = (options.scale ?? DEFAULT_SCALE).slice().sort((a, b) => a - b)
    const allow = new Set(options.allow ?? [])
    const allowInsetHairline = options.allowInsetHairline !== false
    const exemptFiles = options.exemptFiles ?? []
    const filename = (context.filename ?? context.getFilename() ?? '').replace(/\\/g, '/')

    if (exemptFiles.some((fragment) => filename.includes(fragment))) return {}

    const scaleLabel = scale.join(' ')
    const scaleSet = new Set(scale)

    function isOnScale(px, prop) {
      const magnitude = Math.abs(px)
      if (scaleSet.has(magnitude)) return true
      if (allow.has(magnitude)) return true
      if (allowInsetHairline && magnitude === 1 && INSET_PROPS.has(prop)) return true
      return false
    }

    function nearestStep(px) {
      const magnitude = Math.abs(px)
      let best = scale[0]
      for (const step of scale) {
        if (Math.abs(step - magnitude) < Math.abs(best - magnitude)) best = step
      }
      return px < 0 ? -best : best
    }

    function isUnambiguous(px) {
      const magnitude = Math.abs(px)
      const nearest = Math.abs(nearestStep(px))
      if (nearest === 0) return false
      if (Math.abs(magnitude - nearest) > 1) return false
      return scale.filter((step) => Math.abs(step - magnitude) <= 1).length === 1
    }

    function reportStyleValue(valueNode, prop) {
      const px = pxFromStyleValue(valueNode)
      if (px === null || isOnScale(px, prop)) return
      const nearest = nearestStep(px)
      context.report({
        node: valueNode,
        messageId: 'offScaleStyle',
        data: { value: String(px), prop, scale: scaleLabel, nearest: String(nearest) },
        fix: isUnambiguous(px)
          ? (fixer) => {
              if (valueNode.type === 'Literal' && typeof valueNode.value === 'string') {
                const unit = valueNode.value.trim().endsWith('rem') ? 'rem' : 'px'
                const amount = unit === 'rem' ? nearest / 16 : nearest
                const quote = context.sourceCode.getText(valueNode)[0]
                return fixer.replaceText(valueNode, `${quote}${amount}${unit}${quote}`)
              }
              return fixer.replaceText(valueNode, String(nearest))
            }
          : undefined,
      })
    }

    function scanStyleObject(node) {
      if (!node) return
      if (node.type === 'ArrayExpression') {
        for (const element of node.elements) scanStyleObject(element)
        return
      }
      if (node.type === 'ConditionalExpression') {
        scanStyleObject(node.consequent)
        scanStyleObject(node.alternate)
        return
      }
      if (node.type !== 'ObjectExpression') return
      for (const property of node.properties) {
        const name = propertyName(property)
        if (name === null || !SPACING_PROPS.has(name)) continue
        reportStyleValue(property.value, name)
      }
    }

    function scanClassString(node, text, offset) {
      const canFix = node.type === 'Literal'
      let cursor = 0
      for (const raw of text.split(/(\s+)/)) {
        const start = cursor
        cursor += raw.length
        const token = raw.trim()
        if (!token) continue
        const bare = stripVariants(token)
        const match = CLASS_TOKEN.exec(bare)
        if (!match) continue
        const [, sign, utility, value] = match
        const prop = UTILITY_TO_PROP.get(utility)
        if (!prop) continue
        const magnitude = value.startsWith('[') ? pxFromArbitrary(value) : Number(value) * TAILWIND_STEP_PX
        if (magnitude === null || !Number.isFinite(magnitude)) continue
        const px = sign === '-' ? -magnitude : magnitude
        if (isOnScale(px, prop)) continue
        const nearest = nearestStep(px)
        const suggestion = `${sign}${utility}-${Math.abs(nearest) / TAILWIND_STEP_PX}`
        const tokenStart = offset + start + raw.indexOf(token)
        context.report({
          node,
          loc: node.loc,
          messageId: 'offScaleClass',
          data: { token, value: String(px), scale: scaleLabel, suggestion },
          fix:
            canFix && isUnambiguous(px) && Math.abs(nearest) % TAILWIND_STEP_PX === 0
              ? (fixer) => {
                  const replacement = token.slice(0, token.length - bare.length) + suggestion
                  return fixer.replaceTextRange([tokenStart, tokenStart + token.length], replacement)
                }
              : undefined,
        })
      }
    }

    function scanClassExpression(node) {
      if (!node) return
      if (node.type === 'Literal' && typeof node.value === 'string') {
        scanClassString(node, node.value, node.range[0] + 1)
        return
      }
      if (node.type === 'TemplateLiteral') {
        for (const quasi of node.quasis) scanClassString(quasi, quasi.value.raw, quasi.range[0] + 1)
        for (const expression of node.expressions) scanClassExpression(expression)
        return
      }
      if (node.type === 'CallExpression') {
        for (const argument of node.arguments) scanClassExpression(argument)
        return
      }
      if (node.type === 'ConditionalExpression') {
        scanClassExpression(node.consequent)
        scanClassExpression(node.alternate)
        return
      }
      if (node.type === 'LogicalExpression') {
        scanClassExpression(node.left)
        scanClassExpression(node.right)
        return
      }
      if (node.type === 'ArrayExpression') {
        for (const element of node.elements) scanClassExpression(element)
        return
      }
      if (node.type === 'ObjectExpression') {
        for (const property of node.properties) {
          if (property.type !== 'Property') continue
          if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
            scanClassString(property.key, property.key.value, property.key.range[0] + 1)
          }
        }
      }
    }

    return {
      JSXAttribute(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : null
        if (name === 'style' && node.value?.type === 'JSXExpressionContainer') {
          scanStyleObject(node.value.expression)
          return
        }
        if (name !== 'className' && name !== 'class') return
        if (node.value?.type === 'Literal') scanClassExpression(node.value)
        else if (node.value?.type === 'JSXExpressionContainer') scanClassExpression(node.value.expression)
      },
      CallExpression(node) {
        if (!isStyleSheetCreate(node)) return
        const argument = node.arguments[0]
        if (argument?.type !== 'ObjectExpression') return
        for (const property of argument.properties) {
          if (property.type !== 'Property') continue
          scanStyleObject(property.value)
        }
      },
    }
  },
}
