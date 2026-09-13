/**
 * Local ESLint rule: control labels stay within the DESIGN.md word cap.
 *
 * DESIGN.md:860: "Labels are verb-first and 1 to 2 words."
 * DESIGN.md:939: "Strings stay short: 1 to 2 words on buttons, chips, tabs and labels.
 * Sentences live only in body, description and empty-state copy."
 *
 * Controls and their label-bearing props are options data. The rule resolves static
 * `t('key')` calls against both English and Brazilian Portuguese once per process.
 * A placeholder such as `{count}` is one word, punctuation is not a word, and a
 * hyphenated compound is one word. An ICU plural block is skipped rather than guessed.
 *
 * WHAT IT DOES NOT SEE, stated rather than guessed at:
 *   - a translation key assembled at runtime, including `t(dynamicKey)`.
 *   - a locale value that is not a string or a key absent from either locale file.
 *   - text assembled by runtime helpers other than `useMemo`, or imported from another file.
 *   - a label split across multiple sibling JSX nodes. Each provable node is checked alone.
 *   - body, description, heading, empty-state or toast copy unless a configured control
 *     explicitly names that prop as its visible label.
 */

const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const {
  getAttribute,
  getAttributeValueNode,
  getElementName,
  getPropertyKeyName,
} = require('./_jsx-strings.cjs')

// DESIGN.md:939: "Strings stay short: 1 to 2 words on buttons, chips, tabs and labels."
const MAX_CONTROL_WORDS = 2

const LOCALE_PATHS = [
  ['en', join(__dirname, '..', 'packages', 'shared', 'src', 'i18n', 'en.json')],
  ['pt-BR', join(__dirname, '..', 'packages', 'shared', 'src', 'i18n', 'pt-BR.json')],
]
const LABEL_WRAPPERS = new Set(['Text', 'RNText', 'Label', 'span'])
const ICU_PLURAL = /\{\s*[\w.-]+\s*,\s*(?:plural|selectordinal)\s*,/u
const PLACEHOLDER = /\{[^{}]+\}/gu
const WORD = /[\p{L}\p{N}]+(?:[-'’\u2010-\u2015][\p{L}\p{N}]+)*/gu

const localeCache = new Map()

function locales() {
  return LOCALE_PATHS.map(([locale, path]) => {
    if (!localeCache.has(path)) localeCache.set(path, JSON.parse(readFileSync(path, 'utf8')))
    return [locale, localeCache.get(path)]
  })
}

function localeValue(messages, key) {
  let current = messages
  for (const part of key.split('.')) {
    if (current == null || typeof current !== 'object' || !(part in current)) return null
    current = current[part]
  }
  return typeof current === 'string' ? current : null
}

function wordCount(label) {
  if (ICU_PLURAL.test(label)) return null
  const normalized = label.replace(PLACEHOLDER, ' placeholder ')
  return normalized.match(WORD)?.length ?? 0
}

function unwrap(node) {
  if (!node) return null
  if (
    node.type === 'JSXExpressionContainer' ||
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'TSNonNullExpression' ||
    node.type === 'ChainExpression'
  ) return unwrap(node.expression)
  return node
}

function staticString(node) {
  const value = unwrap(node)
  if (value?.type === 'Literal' && typeof value.value === 'string') return value.value
  if (value?.type === 'TemplateLiteral' && value.expressions.length === 0) {
    return value.quasis[0]?.value.cooked ?? value.quasis[0]?.value.raw ?? ''
  }
  return null
}

function variableFor(name, scope) {
  for (let current = scope; current; current = current.upper) {
    const variable = current.variables.find((candidate) => candidate.name === name)
    if (variable) return variable
  }
  return null
}

function callName(node) {
  const callee = unwrap(node)?.callee
  if (callee?.type === 'Identifier') return callee.name
  if (callee?.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
    return callee.property.name
  }
  return null
}

function translationPrefix(call, sourceCode) {
  const callee = unwrap(call)?.callee
  if (callee?.type !== 'Identifier') return null
  const variable = variableFor(callee.name, sourceCode.getScope(call))
  const definition = variable?.defs.at(-1)
  if (!definition || definition.type !== 'Variable') return null
  const declarator = definition.node
  const init = unwrap(declarator.init)

  if (declarator.id.type === 'Identifier' && callName(init) === 'useTranslations') {
    return staticString(init.arguments[0]) ?? ''
  }
  if (declarator.id.type !== 'ObjectPattern' || callName(init) !== 'useTranslation') return null
  const bindsTranslation = declarator.id.properties.some((property) =>
    property.type === 'Property' &&
    getPropertyKeyName(property) === 't' &&
    property.value.type === 'Identifier' &&
    property.value.name === callee.name,
  )
  return bindsTranslation ? staticString(init.arguments[0]) ?? '' : null
}

function translatedCandidates(call, sourceCode) {
  const prefix = translationPrefix(call, sourceCode)
  const key = staticString(unwrap(call).arguments[0])
  if (prefix === null || key === null) return []
  const fullKey = prefix ? `${prefix}.${key}` : key
  return locales().flatMap(([locale, messages]) => {
    const label = localeValue(messages, fullKey)
    return label === null ? [] : [{ label, locale }]
  })
}

function functionResult(node) {
  const value = unwrap(node)
  if (value?.type !== 'ArrowFunctionExpression' && value?.type !== 'FunctionExpression') return null
  if (value.body.type !== 'BlockStatement') return value.body
  return value.body.body.find((statement) => statement.type === 'ReturnStatement')?.argument ?? null
}

function bindingValue(identifier, sourceCode) {
  const variable = variableFor(identifier.name, sourceCode.getScope(identifier))
  const definition = variable?.defs.at(-1)
  if (!definition) return null
  if (definition.type === 'Variable') return definition.node.init
  if (definition.type !== 'Parameter') return null

  const callback = definition.node
  const parameterIndex = callback.params.indexOf(definition.name)
  const call = callback.parent
  const callee = unwrap(call)?.callee
  if (
    parameterIndex !== 0 ||
    call?.type !== 'CallExpression' ||
    callee?.type !== 'MemberExpression' ||
    callName(call) !== 'map'
  ) return null
  return callee.object
}

function sourceCandidates(node, sourceCode, seen = new Set()) {
  const value = unwrap(node)
  if (!value || seen.has(value)) return []
  seen.add(value)

  const literal = staticString(value)
  if (literal !== null) return [{ label: literal, locale: 'source' }]
  if (value.type === 'CallExpression') {
    if (callName(value) === 't') return translatedCandidates(value, sourceCode)
    if (callName(value) === 'useMemo') return sourceCandidates(functionResult(value.arguments[0]), sourceCode, seen)
    return []
  }
  if (value.type === 'Identifier') {
    return sourceCandidates(bindingValue(value, sourceCode), sourceCode, seen)
  }
  if (value.type === 'ArrayExpression') {
    return value.elements.flatMap((element) => sourceCandidates(element, sourceCode, seen))
  }
  if (value.type === 'ConditionalExpression') {
    return [
      ...sourceCandidates(value.consequent, sourceCode, seen),
      ...sourceCandidates(value.alternate, sourceCode, seen),
    ]
  }
  if (value.type === 'LogicalExpression') {
    return [
      ...sourceCandidates(value.left, sourceCode, seen),
      ...sourceCandidates(value.right, sourceCode, seen),
    ]
  }
  if (value.type === 'ArrowFunctionExpression' || value.type === 'FunctionExpression') {
    return sourceCandidates(functionResult(value), sourceCode, seen)
  }
  return []
}

function childCandidates(element, sourceCode) {
  return element.children.flatMap((child) => {
    if (child.type === 'JSXText') {
      const label = child.value.replace(/\s+/g, ' ').trim()
      return label ? [{ label, locale: 'source' }] : []
    }
    if (child.type === 'JSXExpressionContainer') return sourceCandidates(child.expression, sourceCode)
    if (child.type !== 'JSXElement' || !LABEL_WRAPPERS.has(getElementName(child.openingElement))) return []
    return childCandidates(child, sourceCode)
  })
}

function collectionCandidates(node, sourceCode, seen = new Set()) {
  const value = unwrap(node)
  if (!value || seen.has(value)) return []
  seen.add(value)

  if (value.type === 'Identifier') {
    return collectionCandidates(bindingValue(value, sourceCode), sourceCode, seen)
  }
  if (value.type === 'CallExpression' && callName(value) === 'useMemo') {
    return collectionCandidates(functionResult(value.arguments[0]), sourceCode, seen)
  }
  if (value.type === 'ArrayExpression') {
    return value.elements.flatMap((element) => collectionCandidates(element, sourceCode, seen))
  }
  if (value.type === 'ObjectExpression') {
    const labelProperty = value.properties.find(
      (property) => property.type === 'Property' && getPropertyKeyName(property) === 'label',
    )
    return labelProperty?.type === 'Property'
      ? sourceCandidates(labelProperty.value, sourceCode)
      : []
  }
  if (value.type === 'ConditionalExpression') {
    return [
      ...collectionCandidates(value.consequent, sourceCode, seen),
      ...collectionCandidates(value.alternate, sourceCode, seen),
    ]
  }
  return []
}

function nestedPropertyCandidates(node, path, sourceCode, seen = new Set()) {
  if (path.length === 0) return sourceCandidates(node, sourceCode)

  const value = unwrap(node)
  if (!value || seen.has(value)) return []
  seen.add(value)

  if (value.type === 'Identifier') {
    return nestedPropertyCandidates(bindingValue(value, sourceCode), path, sourceCode, seen)
  }
  if (value.type === 'CallExpression' && callName(value) === 'useMemo') {
    return nestedPropertyCandidates(functionResult(value.arguments[0]), path, sourceCode, seen)
  }
  if (value.type === 'ObjectExpression') {
    const property = value.properties.find(
      (candidate) => candidate.type === 'Property' && getPropertyKeyName(candidate) === path[0],
    )
    return property?.type === 'Property'
      ? nestedPropertyCandidates(property.value, path.slice(1), sourceCode, seen)
      : []
  }
  if (value.type === 'ConditionalExpression') {
    return [
      ...nestedPropertyCandidates(value.consequent, path, sourceCode, seen),
      ...nestedPropertyCandidates(value.alternate, path, sourceCode, seen),
    ]
  }
  if (value.type === 'LogicalExpression') {
    return [
      ...nestedPropertyCandidates(value.left, path, sourceCode, seen),
      ...nestedPropertyCandidates(value.right, path, sourceCode, seen),
    ]
  }
  return []
}

function attributeCandidates(openingElement, prop, sourceCode) {
  const [attributeName, ...path] = prop.split('.')
  const attribute = getAttribute(openingElement, attributeName)
  if (!attribute) return []
  const value = getAttributeValueNode(attribute)
  return path.length === 0
    ? sourceCandidates(value, sourceCode)
    : nestedPropertyCandidates(value, path, sourceCode)
}

function roleMatches(openingElement, roles) {
  if (!roles?.length) return true
  return ['role', 'accessibilityRole'].some((name) => {
    const role = staticString(getAttributeValueNode(getAttribute(openingElement, name)))
    return role !== null && roles.includes(role)
  })
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Keep static control labels within the two-word DESIGN.md cap in both locales.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          controls: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                labelProps: { type: 'array', items: { type: 'string' } },
                collectionProps: { type: 'array', items: { type: 'string' } },
                roles: { type: 'array', items: { type: 'string' } },
              },
              required: ['name'],
              additionalProperties: false,
            },
          },
        },
        required: ['controls'],
        additionalProperties: false,
      },
    ],
    messages: {
      tooManyWords:
        '{{control}} label "{{label}}" has {{count}} words in {{locale}}. DESIGN.md allows at most {{limit}} words on controls.',
    },
  },
  create(context) {
    const controls = context.options[0]?.controls ?? []
    const sourceCode = context.sourceCode

    return {
      JSXOpeningElement(openingElement) {
        const control = controls.find((candidate) =>
          candidate.name === getElementName(openingElement) && roleMatches(openingElement, candidate.roles),
        )
        if (!control) return

        const element = openingElement.parent
        const candidates = []
        for (const prop of control.labelProps ?? []) {
          candidates.push(...(prop === 'children'
            ? childCandidates(element, sourceCode)
            : attributeCandidates(openingElement, prop, sourceCode)))
        }
        for (const prop of control.collectionProps ?? []) {
          const attribute = getAttribute(openingElement, prop)
          if (attribute) candidates.push(...collectionCandidates(getAttributeValueNode(attribute), sourceCode))
        }

        const reported = new Set()
        for (const candidate of candidates) {
          const count = wordCount(candidate.label)
          const identity = `${candidate.locale}\u0000${candidate.label}`
          if (count === null || count <= MAX_CONTROL_WORDS || reported.has(identity)) continue
          reported.add(identity)
          context.report({
            node: openingElement,
            messageId: 'tooManyWords',
            data: {
              control: control.name,
              label: candidate.label,
              count: String(count),
              locale: candidate.locale,
              limit: String(MAX_CONTROL_WORDS),
            },
          })
        }
      },
    }
  },
}
