/**
 * Local ESLint rule: every layout spacing value must sit on the DESIGN.md scale.
 *
 * DESIGN.md `### Spacing (base 4)` enumerates the only legal steps
 * (0 4 8 12 16 24 32 48 64 96 px). This gate reads spacing from the
 * three places it actually lives in Orbit - JSX inline and local constant style objects,
 * React Native `StyleSheet.create({ })` objects, and Tailwind `className`
 * utilities (both scale steps and arbitrary `[13px]` values) - because a
 * CSS-only linter sees none of the first two. Style values are read both
 * as a single length (`padding: 15`, `'15px'`) and as a multi-value shorthand
 * string (`padding: '0 20px 6px'`), so a spaced shorthand is not a loophole;
 * unparseable tokens (`auto`, `calc(...)`, `%`) make the rule skip that value.
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
 * Local constants: analyse object literals, `as const`, `satisfies`, non-null
 * wrappers, identifier aliases, arrays with later-entry precedence, spreads
 * copied at evaluation time, Object.assign with static sources, direct property
 * writes, and conditional branches. A shape outside this list is not analysed,
 * so it neither reports nor suppresses spacing on that value. An unresolved
 * entry within an analysed array, spread, or Object.assign may overwrite
 * earlier keys.
 * A mutation is definite only when its statement shares the declaration block.
 */

// DESIGN.md "Spacing (base 4)": "The scale is these ten values and nothing else"
// (chosen by Thomas against the rendered reference, 2026-08-15). It drops 20, 28, 40
// and 56, which are the values the existing violations cluster around, so there is
// less to choose wrongly between, and its jumps widen at the top to serve the
// spacious direction. https://github.com/thomasluizon/orbit-tickets/issues/36
const DEFAULT_SCALE = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96]

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

function shorthandTokens(text) {
  const tokens = []
  for (const part of text.split(/\s+/)) {
    if (/^-?\d+(\.\d+)?$/.test(part)) tokens.push({ raw: part, px: Number(part), unit: '' })
    else if (/^-?\d+(\.\d+)?px$/.test(part)) tokens.push({ raw: part, px: Number(part.slice(0, -2)), unit: 'px' })
    else if (/^-?\d+(\.\d+)?rem$/.test(part)) tokens.push({ raw: part, px: Number(part.slice(0, -3)) * 16, unit: 'rem' })
    else return null
  }
  return tokens
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
        'Require every margin/padding/gap/inset value to sit on the enumerated DESIGN.md spacing scale, across JSX styles, StyleSheet.create, and Tailwind classes.',
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
        '{{value}}px is off the spacing scale ({{prop}}). DESIGN.md allows {{scale}}. Use {{nearest}}, or add a named exemption to the rule options - never widen the scale.',
      offScaleClass:
        '`{{token}}` resolves to {{value}}px, off the spacing scale. DESIGN.md allows {{scale}}. Use `{{suggestion}}`, or add a named exemption to the rule options - never widen the scale.',
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
    const scannedStyleProperties = new WeakSet()
    const scannedMutationValues = new WeakSet()
    const activeStyleBindings = new WeakSet()
    const mutatedStyleProperties = new WeakMap()
    const jsxStyleExpressions = []

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

    function renderScaleAmount(px, unit) {
      const nearest = nearestStep(px)
      if (unit === 'rem') return `${nearest / 16}rem`
      if (unit === 'px') return `${nearest}px`
      return String(nearest)
    }

    function reportSingleStyleValue(valueNode, prop, px) {
      if (isOnScale(px, prop)) return
      const nearest = nearestStep(px)
      context.report({
        node: valueNode,
        messageId: 'offScaleStyle',
        data: { value: String(px), prop, scale: scaleLabel, nearest: String(nearest) },
        fix: isUnambiguous(px)
          ? (fixer) => {
              if (valueNode.type === 'Literal' && typeof valueNode.value === 'string') {
                const unit = valueNode.value.trim().endsWith('rem') ? 'rem' : 'px'
                const quote = context.sourceCode.getText(valueNode)[0]
                return fixer.replaceText(valueNode, `${quote}${renderScaleAmount(px, unit)}${quote}`)
              }
              return fixer.replaceText(valueNode, String(nearest))
            }
          : undefined,
      })
    }

    function reportShorthandStyleValue(valueNode, prop) {
      const text = valueNode.value.trim()
      if (!/\s/.test(text)) return
      const tokens = shorthandTokens(text)
      if (tokens === null) return
      const offScale = tokens.filter((token) => !isOnScale(token.px, prop))
      if (offScale.length === 0) return
      const allFixable = offScale.every((token) => isUnambiguous(token.px))
      let fix
      if (allFixable) {
        const quote = context.sourceCode.getText(valueNode)[0]
        const fixed = tokens
          .map((token) => (isOnScale(token.px, prop) ? token.raw : renderScaleAmount(token.px, token.unit)))
          .join(' ')
        fix = (fixer) => fixer.replaceText(valueNode, `${quote}${fixed}${quote}`)
      }
      for (const token of offScale) {
        context.report({
          node: valueNode,
          messageId: 'offScaleStyle',
          data: { value: String(token.px), prop, scale: scaleLabel, nearest: String(nearestStep(token.px)) },
          fix,
        })
      }
    }

    function reportStyleValue(valueNode, prop) {
      const px = pxFromStyleValue(valueNode)
      if (px !== null) {
        reportSingleStyleValue(valueNode, prop, px)
        return
      }
      if (valueNode.type === 'Literal' && typeof valueNode.value === 'string') {
        reportShorthandStyleValue(valueNode, prop)
      }
    }

    function unwrapStyleExpression(node) {
      while (node && (node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression' || node.type === 'TSNonNullExpression')) node = node.expression
      return node
    }

    function findBinding(node) {
      let scope = context.sourceCode.getScope(node)
      while (scope) {
        const variable = scope.set.get(node.name)
        if (variable) return variable
        scope = scope.upper
      }
      return null
    }

    function markMutatedBinding(node, mutation, visited = new WeakSet()) {
      node = unwrapStyleExpression(node)
      if (node?.type !== 'Identifier') return
      const variable = findBinding(node)
      if (!variable || visited.has(variable)) return
      visited.add(variable)
      const mutations = mutatedStyleProperties.get(variable) ?? []
      mutations.push(mutation)
      mutatedStyleProperties.set(variable, mutations)
      const definition = variable.defs[0]
      if (variable.defs.length === 1 && definition?.type === 'Variable' && definition.parent.kind === 'const') {
        markMutatedBinding(definition.node.init, mutation, visited)
      }
    }

    function mutationPropertyName(node) {
      if (!node.computed && node.property.type === 'Identifier') return node.property.name
      if (node.computed && node.property.type === 'Literal') return String(node.property.value)
      return '*'
    }

    function isDefiniteMutation(mutation, variable) {
      const statement = mutation.node.parent
      const declaration = variable.defs[0].node.parent
      const block = declaration.parent
      return (block.type === 'Program' || block.type === 'BlockStatement') && statement.type === 'ExpressionStatement' && statement.parent === block
    }

    function scanBinding(variable, initializer, ignored, cutoff) {
      activeStyleBindings.add(variable)
      const shadowed = new Set(ignored)
      const knownKeys = new Set()
      const deletedKeys = new Set()
      let hasUnknownKey = false
      const mutations = (mutatedStyleProperties.get(variable) ?? [])
        .filter((mutation) => mutation.position < cutoff)
        .sort((left, right) => right.position - left.position)
      for (const mutation of mutations) {
        const definite = isDefiniteMutation(mutation, variable)
        if (mutation.kind === 'assign') {
          if (!definite) hasUnknownKey = true
          for (let index = mutation.sources.length - 1; index >= 0; index--) {
            const keys = scanStyleObject(mutation.sources[index], shadowed, mutation.position)
            if (keys === null) {
              shadowed.add('*')
              hasUnknownKey = true
            } else {
              for (const key of keys) {
                if (definite && !deletedKeys.has(key)) knownKeys.add(key)
                shadowed.add(key)
              }
            }
          }
          continue
        }
        if (mutation.name === '*') {
          shadowed.add('*')
          hasUnknownKey = true
          continue
        }
        if (mutation.kind === 'delete') {
          if (definite) {
            if (!knownKeys.has(mutation.name)) deletedKeys.add(mutation.name)
            shadowed.add(mutation.name)
          } else {
            hasUnknownKey = true
          }
        } else {
          if (!definite) hasUnknownKey = true
          if (definite && !deletedKeys.has(mutation.name)) knownKeys.add(mutation.name)
          if (!deletedKeys.has(mutation.name) && !shadowed.has('*') && !shadowed.has(mutation.name) && SPACING_PROPS.has(mutation.name) && mutation.value && !scannedMutationValues.has(mutation.node)) {
            scannedMutationValues.add(mutation.node)
            reportStyleValue(mutation.value, mutation.name)
          }
          shadowed.add(mutation.name)
        }
      }
      const initialKeys = scanStyleObject(initializer, shadowed, cutoff)
      activeStyleBindings.delete(variable)
      if (initialKeys === null || hasUnknownKey) return null
      for (const key of initialKeys) {
        if (!deletedKeys.has(key)) knownKeys.add(key)
      }
      return knownKeys
    }

    function scanStyleObject(node, ignored = new Set(), cutoff = Infinity) {
      node = unwrapStyleExpression(node)
      if (!node) return null
      if (node.type === 'Literal' && (node.value === null || node.value === false)) return new Set()
      if (node.type === 'Identifier') {
        const variable = findBinding(node)
        if (!variable || activeStyleBindings.has(variable)) return null
        const definition = variable.defs[0]
        if (variable.defs.length === 1 && definition?.type === 'Variable' && definition.parent.kind === 'const') {
          return scanBinding(variable, definition.node.init, ignored, cutoff)
        }
        return null
      }
      if (node.type === 'ArrayExpression') {
        const knownKeys = new Set()
        const shadowed = new Set(ignored)
        let hasUnknownKey = false
        for (let index = node.elements.length - 1; index >= 0; index--) {
          const elementKeys = scanStyleObject(node.elements[index], shadowed, cutoff)
          if (elementKeys === null) {
            shadowed.add('*')
            hasUnknownKey = true
          } else {
            for (const key of elementKeys) {
              knownKeys.add(key)
              shadowed.add(key)
            }
          }
        }
        return hasUnknownKey ? null : knownKeys
      }
      if (node.type === 'ConditionalExpression') {
        const consequentKeys = scanStyleObject(node.consequent, ignored, cutoff)
        const alternateKeys = scanStyleObject(node.alternate, ignored, cutoff)
        if (consequentKeys === null || alternateKeys === null) return null
        return new Set([...consequentKeys].filter((key) => alternateKeys.has(key)))
      }
      if (node.type !== 'ObjectExpression') return null
      const knownKeys = new Set()
      const shadowed = new Set(ignored)
      let hasUnknownKey = false
      for (let index = node.properties.length - 1; index >= 0; index--) {
        const property = node.properties[index]
        if (property.type === 'SpreadElement') {
          const spreadKeys = scanStyleObject(property.argument, shadowed, Math.min(cutoff, property.range[0]))
          if (spreadKeys === null) {
            shadowed.add('*')
            hasUnknownKey = true
          } else {
            for (const key of spreadKeys) {
              knownKeys.add(key)
              shadowed.add(key)
            }
          }
          continue
        }
        const name = propertyName(property)
        if (name === null) {
          shadowed.add('*')
          hasUnknownKey = true
          continue
        }
        knownKeys.add(name)
        if (!shadowed.has('*') && !shadowed.has(name) && SPACING_PROPS.has(name) && !scannedStyleProperties.has(property)) {
          scannedStyleProperties.add(property)
          reportStyleValue(property.value, name)
        }
        shadowed.add(name)
      }
      return hasUnknownKey ? null : knownKeys
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
          jsxStyleExpressions.push(node.value.expression)
          return
        }
        if (name !== 'className' && name !== 'class') return
        if (node.value?.type === 'Literal') scanClassExpression(node.value)
        else if (node.value?.type === 'JSXExpressionContainer') scanClassExpression(node.value.expression)
      },
      CallExpression(node) {
        if (node.callee.type === 'MemberExpression' && !node.callee.computed && node.callee.object.type === 'Identifier' && node.callee.object.name === 'Object' && node.callee.property.type === 'Identifier' && node.callee.property.name === 'assign') {
          markMutatedBinding(node.arguments[0], { kind: 'assign', sources: node.arguments.slice(1), position: node.range[0], node })
        }
        if (!isStyleSheetCreate(node)) return
        const argument = node.arguments[0]
        if (argument?.type !== 'ObjectExpression') return
        for (const property of argument.properties) {
          if (property.type !== 'Property') continue
          scanStyleObject(property.value)
        }
      },
      AssignmentExpression(node) {
        if (node.left.type === 'MemberExpression') markMutatedBinding(node.left.object, { kind: 'write', name: mutationPropertyName(node.left), value: node.operator === '=' ? node.right : null, position: node.range[0], node })
      },
      UpdateExpression(node) {
        if (node.argument.type === 'MemberExpression') markMutatedBinding(node.argument.object, { kind: 'write', name: mutationPropertyName(node.argument), position: node.range[0], node })
      },
      UnaryExpression(node) {
        if (node.operator === 'delete' && node.argument.type === 'MemberExpression') markMutatedBinding(node.argument.object, { kind: 'delete', name: mutationPropertyName(node.argument), position: node.range[0], node })
      },
      'Program:exit'() {
        for (const expression of jsxStyleExpressions) scanStyleObject(expression)
      },
    }
  },
}
