// ## Analysis boundary
// Gap and inset identifiers resolve only write-free const object literals and logical
// expressions. Unknown logical guards keep both operands reachable. Mutated styles
// stay silent because their value at the JSX use cannot be established here.

// DESIGN.md "Spacing (base 4)": "The scale is these ten values and nothing else"
// and 56, which are the values the existing violations cluster around, so there is
// less to choose wrongly between, and its jumps widen at the top to serve the
// spacious direction. https://github.com/thomasluizon/orbit-tickets/issues/36
const DEFAULT_SCALE = Object.values(require('../packages/shared/src/theme/spacing.json').scale)

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

const CLASS_TOKEN = /^(-?)([a-z]+(?:-[xy])?)-(\[[^\]]+\]|px|\d+(?:\.\d+)?)$/

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

function literalLengths(text) {
  const expression = text.replaceAll('_', ' ').replace(/var\(\s*--[\w-]+/g, 'var(')
  return [...expression.matchAll(/(?<![\w.-])(-?\d*\.?\d+)(px|rem|em)(?![\w.-])/g)]
    .map((match) => ({ raw: match[0], unit: match[2], px: Number(match[1]) * (match[2] === 'rem' ? 16 : 1) }))
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
        'Require DESIGN.md spacing in inline JSX, StyleSheet.create, Tailwind classes, and write-free local const object literals passed as JSX style identifiers; runtime values are not evaluated.',
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
      relativeSpacing: '{{value}} depends on the text size ({{prop}}). Use a shared SPACING value or padding role.',
      offScaleStyle:
        '{{value}}px is off the spacing scale ({{prop}}). DESIGN.md allows {{scale}}. Use {{nearest}} from SPACING. Regenerate web aliases with npm run spacing:generate -w @orbit/eslint-rules; named exemptions use the allow option.',
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
    const styleIdentifiers = []
    const styleSpreadObjects = []
    const reportedLiterals = new WeakSet()
    const reportedClassNodes = new WeakSet()

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

    function reportSingleStyleValue(valueNode, prop, px, canFix = true) {
      if (isOnScale(px, prop)) return
      const nearest = nearestStep(px)
      context.report({
        node: valueNode,
        messageId: 'offScaleStyle',
        data: { value: String(px), prop, scale: scaleLabel, nearest: String(nearest) },
        fix: canFix && isUnambiguous(px)
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
      valueNode = unwrapStyleExpression(valueNode)
      if (valueNode.type === 'ConditionalExpression') {
        reportStyleValue(valueNode.consequent, prop)
        reportStyleValue(valueNode.alternate, prop)
        return
      }
      const px = pxFromStyleValue(valueNode)
      if (px !== null) {
        reportSingleStyleValue(valueNode, prop, px)
        return
      }
      if (valueNode.type === 'TemplateLiteral') {
        for (const quasi of valueNode.quasis) reportCompoundStyleValue(quasi, prop, quasi.value.raw)
      } else if (valueNode.type === 'Literal' && typeof valueNode.value === 'string') {
        if (shorthandTokens(valueNode.value.trim()) !== null) reportShorthandStyleValue(valueNode, prop)
        else reportCompoundStyleValue(valueNode, prop, valueNode.value)
      }
    }

    function reportCompoundStyleValue(node, prop, text) {
      for (const length of literalLengths(text)) {
        if (length.unit === 'em' && length.px !== 0) context.report({ node, messageId: 'relativeSpacing', data: { value: length.raw, prop } })
        else reportSingleStyleValue(node, prop, length.px, false)
      }
    }

    function reportCompoundClassValue(node, token, prop, text) {
      for (const length of literalLengths(text)) {
        if (length.unit === 'em' && length.px !== 0) context.report({ node, messageId: 'relativeSpacing', data: { value: length.raw, prop } })
        else if (!isOnScale(length.px, prop)) context.report({ node, messageId: 'offScaleClass', data: {
          token, value: String(length.px), scale: scaleLabel, suggestion: 'a shared padding role',
        } })
      }
    }

    function isTypeWrapper(node) {
      return node?.type === 'TSAsExpression' || node?.type === 'TSSatisfiesExpression' ||
        node?.type === 'TSNonNullExpression'
    }

    function unwrapStyleExpression(node) {
      while (isTypeWrapper(node)) node = node.expression
      return node
    }

    function isStyleAttributeValue(node) {
      return node?.type === 'JSXExpressionContainer' && node.parent?.type === 'JSXAttribute' &&
        node.parent.name.type === 'JSXIdentifier' && node.parent.name.name === 'style'
    }

    function isInlineStyleObject(object) {
      let node = object
      let parent = node.parent
      while (isTypeWrapper(parent) || (parent?.type === 'ConditionalExpression' && parent.test !== node) ||
        parent?.type === 'ArrayExpression') {
        node = parent
        parent = node.parent
      }
      return isStyleAttributeValue(parent)
    }

    function findBinding(node) {
      let scope = context.sourceCode.getScope(node)
      while (scope) {
        const variable = scope.set.get(node.name)
        if (variable && variable.isValueVariable !== false) return variable
        scope = scope.upper
      }
      return null
    }

    function referenceUse(node, seen) {
      let parent = node.parent
      while (isTypeWrapper(parent) || parent?.type === 'LogicalExpression') {
        node = parent
        parent = node.parent
      }
      if (isStyleAttributeValue(parent)) return true
      if (parent?.type === 'VariableDeclarator' && parent.init === node &&
        parent.id.type === 'Identifier') {
        return qualifyingInitializer(findBinding(parent.id), seen) === node
      }
      if (parent?.type !== 'SpreadElement' || parent.parent?.type !== 'ObjectExpression') return false
      const object = parent.parent
      if (isInlineStyleObject(object)) return true
      let owner = object.parent
      while (isTypeWrapper(owner)) owner = owner.parent
      return owner?.type === 'VariableDeclarator' && owner.id.type === 'Identifier' &&
        qualifyingInitializer(findBinding(owner.id), seen) === object
    }

    function qualifyingInitializer(variable, seen = new Set()) {
      if (!variable || seen.has(variable)) return null
      const definition = variable?.defs[0]
      if (variable?.defs.length !== 1 || definition?.type !== 'Variable' ||
        definition.parent.kind !== 'const' || definition.parent.parent?.type === 'ExportNamedDeclaration' ||
        definition.node.id.type !== 'Identifier') return null
      const initializer = unwrapStyleExpression(definition.node.init)
      if (initializer?.type !== 'ObjectExpression' && initializer?.type !== 'LogicalExpression') return null
      const next = new Set(seen).add(variable)
      if (variable.references.some((reference) => reference.identifier !== definition.node.id &&
        (!reference.isReadOnly() || !referenceUse(reference.identifier, next)))) return null
      return initializer
    }

    function staticLogicalValue(node, seen = new Set()) {
      node = unwrapStyleExpression(node)
      if (node?.type === 'ObjectExpression' || node?.type === 'ArrayExpression') {
        return { truthy: true, nullish: false }
      }
      if (node?.type === 'Literal') {
        return { truthy: Boolean(node.value), nullish: node.value === null }
      }
      if (node?.type !== 'Identifier') return null
      const variable = findBinding(node)
      const definition = variable?.defs[0]
      if (!variable || seen.has(variable) || variable.defs.length !== 1 ||
        definition?.type !== 'Variable' || definition.parent.kind !== 'const') return null
      let initializer = definition.node.init
      if (definition.node.id !== definition.name) {
        const pattern = definition.node.id
        if (pattern.type !== 'ObjectPattern' || pattern.properties.some((property) => property.type === 'RestElement') ||
          initializer?.type !== 'ObjectExpression' || initializer.properties.length !== 1) return null
        const binding = pattern.properties.find((property) =>
          property.type === 'Property' && !property.computed && property.value === definition.name)
        const source = initializer.properties[0]
        if (!binding || source.type !== 'Property' || source.computed || source.kind !== 'init' ||
          source.method || propertyName(binding) !== propertyName(source)) return null
        initializer = source.value
      }
      seen.add(variable)
      return staticLogicalValue(initializer, seen)
    }

    function logicalResult(node) {
      const left = staticLogicalValue(node.left)
      if (!left) return null
      if (node.operator === '&&') return left.truthy ? node.right : node.left
      if (node.operator === '||') return left.truthy ? node.left : node.right
      if (node.operator === '??') return left.nullish ? node.right : node.left
      return null
    }

    function resolveObject(node, active) {
      node = unwrapStyleExpression(node)
      if (node?.type === 'LogicalExpression') {
        const result = logicalResult(node)
        return result ? resolveObject(result, active) : null
      }
      if (node?.type === 'Identifier') {
        const variable = findBinding(node)
        const initializer = qualifyingInitializer(variable)
        if (!initializer || active.has(variable)) return null
        active.add(variable)
        const resolved = resolveObject(initializer, active)
        active.delete(variable)
        return resolved
      }
      if (node?.type !== 'ObjectExpression') return null
      const values = new Map()
      const keys = new Set()
      for (const property of node.properties) {
        if (property.type === 'SpreadElement') {
          const spread = resolveObject(property.argument, active)
          if (!spread) {
            values.clear()
            continue
          }
          for (const name of spread.keys) {
            keys.add(name)
            values.set(name, spread.values.get(name) ?? null)
          }
          continue
        }
        const name = propertyName(property)
        if (name === null) {
          values.clear()
          continue
        }
        keys.add(name)
        const literal = property.kind === 'init' && !property.method &&
          (property.value.type === 'Literal' || property.value.type === 'UnaryExpression')
        values.set(name, literal ? property.value : null)
      }
      return { values, keys }
    }

    function scanConstStyle(styleNode) {
      const resolved = resolveObject(styleNode, new Set())
      if (!resolved) {
        const expression = unwrapStyleExpression(styleNode)
        const initializer = expression?.type === 'Identifier'
          ? qualifyingInitializer(findBinding(expression)) : expression
        if (initializer?.type === 'LogicalExpression' && !logicalResult(initializer)) {
          scanConstStyle(initializer.left)
          scanConstStyle(initializer.right)
        }
        return
      }
      for (const [name, value] of resolved.values) {
        if (!value || !SPACING_PROPS.has(name) || reportedLiterals.has(value)) continue
        reportedLiterals.add(value)
        reportStyleValue(value, name)
      }
    }

    function scanStyleObject(node, inlineJsx = false) {
      node = unwrapStyleExpression(node)
      if (!node) return
      if (node.type === 'LogicalExpression') {
        const result = logicalResult(node)
        if (result?.type === 'Identifier') scanConstStyle(result)
        else if (result) scanStyleObject(result, inlineJsx)
        else {
          scanStyleObject(node.left, inlineJsx)
          scanStyleObject(node.right, inlineJsx)
        }
        return
      }
      if (node.type === 'Identifier') {
        scanConstStyle(node)
        return
      }
      if (node.type === 'ArrayExpression') {
        for (const element of node.elements) scanStyleObject(element)
        return
      }
      if (node.type === 'ConditionalExpression') {
        scanStyleObject(node.consequent, inlineJsx)
        scanStyleObject(node.alternate, inlineJsx)
        return
      }
      if (node.type !== 'ObjectExpression') return
      const spreads = inlineJsx && node.properties.some((property) => property.type === 'SpreadElement')
      if (spreads) styleSpreadObjects.push(node)
      node.properties.forEach((property, index) => {
        const name = propertyName(property)
        if (name === null || !SPACING_PROPS.has(name)) return
        if (spreads && laterSpreadSetsKey(node.properties.slice(index + 1), name)) return
        reportedLiterals.add(property.value)
        reportStyleValue(property.value, name)
      })
    }

    function laterSpreadSetsKey(laterProperties, name) {
      return laterProperties.some((property) =>
        property.type === 'SpreadElement' && resolveObject(property.argument, new Set())?.keys.has(name))
    }

    function scanClassString(node, text, offset) {
      if (reportedClassNodes.has(node)) return
      reportedClassNodes.add(node)
      const canFix = node.type === 'Literal'
      let cursor = 0
      for (const raw of text.split(/(\s+)/)) {
        const start = cursor
        cursor += raw.length
        const token = raw.trim()
        if (!token) continue
        const important = stripVariants(token)
        const bare = important.replace(/^!|!$/g, '')
        const arbitrary = /^\[((?:padding|margin)(?:-[a-z-]+)?):(.+)\]$/.exec(bare)
        if (arbitrary) {
          reportCompoundClassValue(node, token, arbitrary[1], arbitrary[2])
          continue
        }
        const match = CLASS_TOKEN.exec(bare)
        if (!match) continue
        const [, sign, utility, value] = match
        const prop = UTILITY_TO_PROP.get(utility)
        if (!prop) continue
        const magnitude = value === 'px' ? 1 : value.startsWith('[') ? pxFromArbitrary(value) : Number(value) * TAILWIND_STEP_PX
        if (magnitude === null) {
          reportCompoundClassValue(node, token, prop, value.slice(1, -1))
          continue
        }
        if (!Number.isFinite(magnitude)) continue
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
                  const replacement = token.slice(0, token.length - important.length)
                    + (important.startsWith('!') ? '!' : '') + suggestion + (important.endsWith('!') ? '!' : '')
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
      Literal(node) {
        if (typeof node.value === 'string' && /\b[pm][xytrblse]?-(?:\[|px|\d)|\[(?:padding|margin)(?:-|:)/.test(node.value)) {
          scanClassString(node, node.value, node.range[0] + 1)
        }
      },
      TemplateElement(node) {
        if (/\b[pm][xytrblse]?-(?:\[|px|\d)|\[(?:padding|margin)(?:-|:)/.test(node.value.raw)) {
          scanClassString(node, node.value.raw, node.range[0] + 1)
        }
      },
      Property(node) {
        const name = propertyName(node)
        if (!name || !/^(padding|margin)/.test(name) || !BOX_PROPS.has(name) || reportedLiterals.has(node.value)) return
        reportedLiterals.add(node.value)
        reportStyleValue(node.value, name)
      },
      JSXAttribute(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : null
        if (name === 'style' && node.value?.type === 'JSXExpressionContainer') {
          const expression = unwrapStyleExpression(node.value.expression)
          if (expression?.type === 'Identifier') styleIdentifiers.push(expression)
          else scanStyleObject(expression, true)
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
      'Program:exit'() {
        for (const identifier of styleIdentifiers) scanConstStyle(identifier)
        for (const object of styleSpreadObjects) scanConstStyle(object)
      },
    }
  },
}
