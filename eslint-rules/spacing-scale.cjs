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
 * Local constants carry possible literal, absent, and unknown values per key.
 * Evaluation follows source order through writes, deletes, branches, arrays,
 * spreads, and Object.assign. Branches join their possible values. Unknown
 * keys add uncertainty without removing a known value that may remain applied.
 * Nested functions and class bodies are outside the analysis.
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
    const jsxStyleExpressions = []
    const styleSheetExpressions = []

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

    function isObjectAssign(node) {
      if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression' || node.callee.computed ||
        node.callee.object.type !== 'Identifier' || node.callee.object.name !== 'Object' ||
        node.callee.property.type !== 'Identifier' || node.callee.property.name !== 'assign') return false
      const variable = findBinding(node.callee.object)
      return variable?.scope.type === 'global' && variable.defs.length === 0
    }

    const ABSENT = Symbol('absent')
    const UNKNOWN = Symbol('unknown')
    const reportedValues = new WeakSet()

    function emptyState() {
      return { keys: new Map(), other: new Set([ABSENT]) }
    }

    function unknownState() {
      return { keys: new Map(), other: new Set([ABSENT, UNKNOWN]) }
    }

    function valuesFor(state, key) {
      return state.keys.get(key) ?? state.other
    }

    function copyState(state) {
      return { keys: new Map([...state.keys].map(([key, values]) => [key, new Set(values)])), other: new Set(state.other) }
    }

    function joinStates(left, right) {
      const joined = { keys: new Map(), other: new Set([...left.other, ...right.other]) }
      for (const key of new Set([...left.keys.keys(), ...right.keys.keys()])) {
        joined.keys.set(key, new Set([...valuesFor(left, key), ...valuesFor(right, key)]))
      }
      return joined
    }

    function overlay(target, source) {
      const result = emptyState()
      const apply = (previous, incoming) => incoming.has(ABSENT)
        ? new Set([...previous, ...[...incoming].filter((value) => value !== ABSENT)])
        : new Set(incoming)
      result.other = apply(target.other, source.other)
      for (const key of new Set([...target.keys.keys(), ...source.keys.keys()])) {
        result.keys.set(key, apply(valuesFor(target, key), valuesFor(source, key)))
      }
      return result
    }

    function changeUnknownKey(state, effect) {
      const changed = copyState(state)
      for (const values of changed.keys.values()) values.add(effect)
      changed.other.add(effect)
      return changed
    }

    function abstractValue(node) {
      return node?.type === 'Literal' ||
        (node?.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'Literal')
        ? node : UNKNOWN
    }

    function bindingRoot(variable, seen = new Set()) {
      if (!variable || seen.has(variable)) return variable
      seen.add(variable)
      const definition = variable.defs[0]
      if (variable.defs.length !== 1 || definition?.type !== 'Variable' || definition.parent.kind !== 'const') return variable
      const initializer = unwrapStyleExpression(definition.node.init)
      return initializer?.type === 'Identifier' ? bindingRoot(findBinding(initializer), seen) : variable
    }

    function executionContext(node) {
      for (let parent = node; parent; parent = parent.parent) {
        if (parent.type === 'Program' || parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' || parent.type === 'ArrowFunctionExpression') return parent
      }
      return null
    }

    function evaluateBinding(variable, cutoff, active) {
      variable = bindingRoot(variable)
      if (!variable || active.has(variable)) return unknownState()
      const definition = variable.defs[0]
      if (variable.defs.length !== 1 || definition?.type !== 'Variable' || definition.parent.kind !== 'const' || !definition.node.init) return unknownState()
      const initializer = definition.node.init
      if (initializer.range[0] >= cutoff) return unknownState()
      active.add(variable)
      let state = evaluateStyleExpression(initializer, initializer.range[0], active)
      const container = executionContext(definition.node)
      if (container) {
        const body = container.type === 'Program' ? container : container.body
        const outcomes = walk(body, state, initializer.range[1], cutoff, variable, active)
        state = outcomes.filter((outcome) => outcome.flow === 'normal').map((outcome) => outcome.state)
          .reduce((combined, next) => combined ? joinStates(combined, next) : next, null) ?? state
      }
      active.delete(variable)
      return state
    }

    function evaluateStyleExpression(node, cutoff, active = new Set()) {
      node = unwrapStyleExpression(node)
      if (!node) return unknownState()
      if (node.type === 'Literal' && (node.value === null || node.value === false)) return emptyState()
      if (node.type === 'Identifier') return evaluateBinding(findBinding(node), cutoff, active)
      if (node.type === 'ArrayExpression') {
        return node.elements.reduce((state, element) => overlay(state, evaluateStyleExpression(element, element?.range[0] ?? cutoff, active)), emptyState())
      }
      if (node.type === 'ConditionalExpression') {
        if (node.test.type === 'Literal' && typeof node.test.value === 'boolean') {
          return evaluateStyleExpression(node.test.value ? node.consequent : node.alternate, cutoff, active)
        }
        return joinStates(evaluateStyleExpression(node.consequent, cutoff, active), evaluateStyleExpression(node.alternate, cutoff, active))
      }
      if (node.type === 'LogicalExpression') {
        if (node.left.type === 'Literal') {
          const runsRight = node.operator === '&&' ? Boolean(node.left.value)
            : node.operator === '||' ? !node.left.value : node.left.value === null
          return runsRight ? evaluateStyleExpression(node.right, cutoff, active) : emptyState()
        }
        return joinStates(emptyState(), evaluateStyleExpression(node.right, cutoff, active))
      }
      if (isObjectAssign(node)) {
        return node.arguments.slice(1).reduce((state, source) => overlay(state, evaluateStyleExpression(source, node.range[0], active)),
          evaluateStyleExpression(node.arguments[0], node.range[0], active))
      }
      if (node.type !== 'ObjectExpression') return unknownState()
      let state = emptyState()
      for (const property of node.properties) {
        if (property.type === 'SpreadElement') {
          state = overlay(state, evaluateStyleExpression(property.argument, property.range[0], active))
          continue
        }
        const name = propertyName(property)
        if (name === null) state = changeUnknownKey(state, UNKNOWN)
        else state.keys.set(name, new Set([abstractValue(property.value)]))
      }
      return state
    }

    function mutationPropertyName(node) {
      if (!node.computed && node.property.type === 'Identifier') return node.property.name
      if (node.computed && node.property.type === 'Literal') return String(node.property.value)
      return null
    }

    function mutate(state, member, value, remove) {
      const name = mutationPropertyName(member)
      if (name === null) return changeUnknownKey(state, remove ? ABSENT : UNKNOWN)
      const changed = copyState(state)
      changed.keys.set(name, new Set([remove ? ABSENT : abstractValue(value)]))
      return changed
    }

    function targetsBinding(node, variable) {
      node = unwrapStyleExpression(node)
      return node?.type === 'Identifier' && bindingRoot(findBinding(node)) === variable
    }

    function combineOutcomes(outcomes) {
      const combined = new Map()
      for (const outcome of outcomes) {
        const previous = combined.get(outcome.flow)
        combined.set(outcome.flow, previous ? joinStates(previous, outcome.state) : outcome.state)
      }
      return [...combined].map(([flow, state]) => ({ flow, state }))
    }

    function sequence(nodes, state, start, cutoff, variable, active) {
      let outcomes = [{ state, flow: 'normal' }]
      for (const node of nodes) {
        outcomes = combineOutcomes(outcomes.flatMap((outcome) => outcome.flow === 'normal'
          ? walk(node, outcome.state, start, cutoff, variable, active) : [outcome]))
      }
      return outcomes
    }

    function children(node) {
      return Object.entries(node).filter(([key]) => key !== 'parent' && key !== 'tokens' && key !== 'comments')
        .flatMap(([, value]) => Array.isArray(value) ? value : [value])
        .filter((value) => value && typeof value === 'object' && typeof value.type === 'string' && Array.isArray(value.range))
        .sort((left, right) => left.range[0] - right.range[0])
    }

    function walk(node, state, start, cutoff, variable, active) {
      if (!node || node.range[1] <= start || node.range[0] >= cutoff) return [{ state, flow: 'normal' }]
      if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression' || node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return [{ state, flow: 'normal' }]
      if (node.type === 'BreakStatement' || node.type === 'ContinueStatement') {
        return [{ state, flow: node.type }]
      }
      if (node.type === 'ReturnStatement' || node.type === 'ThrowStatement') {
        const outcomes = node.argument ? walk(node.argument, state, start, cutoff, variable, active) : [{ state, flow: 'normal' }]
        return node.range[1] > cutoff ? outcomes : outcomes.map((outcome) => ({ ...outcome, flow: node.type }))
      }
      if (node.type === 'IfStatement') {
        const tested = sequence([node.test], state, start, cutoff, variable, active)
        let branches = node.test.type === 'Literal' && typeof node.test.value === 'boolean'
          ? [node.test.value ? node.consequent : node.alternate]
          : [node.consequent, node.alternate]
        const containing = branches.find((branch) => branch && branch.range[0] <= cutoff && branch.range[1] >= cutoff)
        if (containing) branches = [containing]
        return combineOutcomes(tested.flatMap((outcome) => branches.flatMap((branch) => branch
          ? walk(branch, copyState(outcome.state), start, cutoff, variable, active) : [outcome])))
      }
      if (node.type === 'ConditionalExpression' || node.type === 'LogicalExpression') {
        const condition = node.type === 'ConditionalExpression' ? node.test : node.left
        const tested = sequence([condition], state, start, cutoff, variable, active)
        let branches = node.type === 'ConditionalExpression' ? [node.consequent, node.alternate] : [node.right, null]
        if (condition.type === 'Literal') {
          if (node.type === 'ConditionalExpression') branches = [condition.value ? node.consequent : node.alternate]
          if (node.type === 'LogicalExpression') {
            const runsRight = node.operator === '&&' ? Boolean(condition.value)
              : node.operator === '||' ? !condition.value : condition.value === null
            branches = [runsRight ? node.right : null]
          }
        }
        return combineOutcomes(tested.flatMap((outcome) => branches.flatMap((branch) => branch
          ? walk(branch, copyState(outcome.state), start, cutoff, variable, active) : [outcome])))
      }
      if (node.type === 'SwitchStatement') {
        const tested = sequence([node.discriminant], state, start, cutoff, variable, active)
        return combineOutcomes(tested.flatMap((outcome) => [outcome, ...node.cases.flatMap((_, index) =>
          sequence(node.cases.slice(index).flatMap((branch) => branch.consequent), copyState(outcome.state), start, cutoff, variable, active))]
          .map((result) => result.flow === 'BreakStatement' ? { ...result, flow: 'normal' } : result)))
      }
      if (node.type === 'ForStatement' || node.type === 'ForInStatement' || node.type === 'ForOfStatement' || node.type === 'WhileStatement' || node.type === 'DoWhileStatement') {
        const beforeBody = node.type === 'ForStatement' ? [node.init, node.test] : node.type === 'ForInStatement' || node.type === 'ForOfStatement'
          ? [node.left, node.right] : node.type === 'WhileStatement' ? [node.test] : []
        const entry = sequence(beforeBody.filter(Boolean), state, start, cutoff, variable, active)
        return combineOutcomes(entry.flatMap((outcome) => {
          const body = walk(node.body, copyState(outcome.state), start, cutoff, variable, active)
          const exits = body.flatMap((result) => {
            if (result.flow === 'BreakStatement') return [{ state: result.state, flow: 'normal' }]
            if (result.flow !== 'normal' && result.flow !== 'ContinueStatement') return [result]
            const afterBody = node.type === 'ForStatement' ? [node.update] : node.type === 'DoWhileStatement' ? [node.test] : []
            return sequence(afterBody.filter(Boolean), result.state, start, cutoff, variable, active)
          })
          return [outcome, ...exits]
        }))
      }
      if (node.type === 'TryStatement') {
        const outcomes = [...walk(node.block, copyState(state), start, cutoff, variable, active)]
        if (node.handler) outcomes.push(...walk(node.handler, copyState(state), start, cutoff, variable, active))
        return combineOutcomes(node.finalizer ? outcomes.flatMap((outcome) => walk(node.finalizer, outcome.state, start, cutoff, variable, active)) : outcomes)
      }
      const traversed = sequence(children(node), state, start, cutoff, variable, active)
      return traversed.map((outcome) => {
        if (outcome.flow !== 'normal') return outcome
        let next = outcome.state
        if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && targetsBinding(node.left.object, variable)) {
          next = mutate(next, node.left, node.operator === '=' ? node.right : null, false)
        } else if (node.type === 'UpdateExpression' && node.argument.type === 'MemberExpression' && targetsBinding(node.argument.object, variable)) {
          next = mutate(next, node.argument, null, false)
        } else if (node.type === 'UnaryExpression' && node.operator === 'delete' && node.argument.type === 'MemberExpression' && targetsBinding(node.argument.object, variable)) {
          next = mutate(next, node.argument, null, true)
        } else if (isObjectAssign(node) && targetsBinding(node.arguments[0], variable)) {
          for (const source of node.arguments.slice(1)) next = overlay(next, evaluateStyleExpression(source, node.range[0], active))
        }
        return { state: next, flow: 'normal' }
      })
    }

    function scanStyleObject(node) {
      const state = evaluateStyleExpression(node, node.range[0])
      for (const [name, values] of state.keys) {
        if (!SPACING_PROPS.has(name)) continue
        for (const value of values) {
          if (value === ABSENT || value === UNKNOWN || reportedValues.has(value)) continue
          reportedValues.add(value)
          reportStyleValue(value, name)
        }
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
          jsxStyleExpressions.push(node.value.expression)
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
          styleSheetExpressions.push(property.value)
        }
      },
      'Program:exit'() {
        for (const expression of [...jsxStyleExpressions, ...styleSheetExpressions]) scanStyleObject(expression)
      },
    }
  },
}
