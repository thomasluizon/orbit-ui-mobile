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
const openingElementsCache = new WeakMap()
const localePathsBySourceCode = new WeakMap()

function locales(sourceCode) {
  const paths = localePathsBySourceCode.get(sourceCode) ?? Object.fromEntries(LOCALE_PATHS)
  return Object.entries(paths).map(([locale, path]) => {
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

function openingElementsByName(sourceCode) {
  if (openingElementsCache.has(sourceCode)) return openingElementsCache.get(sourceCode)
  const elements = new Map()
  const visit = (node) => {
    if (!node) return
    if (node.type === 'JSXOpeningElement') {
      const name = getElementName(node)
      if (!elements.has(name)) elements.set(name, [])
      elements.get(name).push(node)
    }
    for (const key of sourceCode.visitorKeys[node.type] ?? []) {
      const child = node[key]
      if (Array.isArray(child)) child.forEach(visit)
      else visit(child)
    }
  }
  visit(sourceCode.ast)
  openingElementsCache.set(sourceCode, elements)
  return elements
}

function objectPropertyValue(node, name, sourceCode, seen) {
  const value = unwrap(node)
  if (!value || seen.has(value)) return null
  seen.add(value)
  if (value.type === 'Identifier') {
    return objectPropertyValue(bindingValue(value, sourceCode), name, sourceCode, seen)
  }
  if (value.type !== 'ObjectExpression') return null
  const property = value.properties.findLast((candidate) =>
    candidate.type === 'Property' && getPropertyKeyName(candidate) === name,
  )
  return property?.type === 'Property' ? property.value : null
}

function componentName(definition) {
  const declarator = definition.node.parent
  if (declarator?.type === 'VariableDeclarator' && declarator.id.type === 'Identifier') {
    return declarator.id.name
  }
  return definition.node.id?.type === 'Identifier' ? definition.node.id.name : null
}

function effectivePropValue(openingElement, propName, sourceCode, seen) {
  for (let index = openingElement.attributes.length - 1; index >= 0; index -= 1) {
    const attribute = openingElement.attributes[index]
    if (attribute.type === 'JSXAttribute' && attribute.name.name === propName) {
      return getAttributeValueNode(attribute)
    }
    if (attribute.type !== 'JSXSpreadAttribute') continue
    const property = objectPropertyValue(attribute.argument, propName, sourceCode, new Set(seen))
    if (property) return property
  }
  return null
}

function componentPropValues(definition, sourceCode, seen) {
  const name = componentName(definition)
  const propName = definition.name?.name
  if (!name || !propName) return []
  const openings = openingElementsByName(sourceCode).get(name) ?? []
  return openings.flatMap((openingElement) => {
    const value = effectivePropValue(openingElement, propName, sourceCode, seen)
    return value ? [value] : []
  })
}

function variableTranslationPrefixes(definition, calleeName) {
  const declarator = definition.node
  const init = unwrap(declarator.init)

  if (declarator.id.type === 'Identifier' && callName(init) === 'useTranslations') {
    return [staticString(init.arguments[0]) ?? '']
  }
  if (declarator.id.type !== 'ObjectPattern' || callName(init) !== 'useTranslation') return []
  const bindsTranslation = declarator.id.properties.some((property) =>
    property.type === 'Property' &&
    getPropertyKeyName(property) === 't' &&
    property.value.type === 'Identifier' &&
    property.value.name === calleeName,
  )
  return bindsTranslation ? [staticString(init.arguments[0]) ?? ''] : []
}

function translatorPrefixes(node, sourceCode, seen = new Set()) {
  const value = unwrap(node)
  if (value?.type !== 'Identifier' || seen.has(value)) return []
  seen.add(value)
  const variable = variableFor(value.name, sourceCode.getScope(value))
  const definition = variable?.defs.at(-1)
  if (!definition) return []
  if (definition.type === 'Variable') {
    const direct = variableTranslationPrefixes(definition, value.name)
    return direct.length ? direct : translatorPrefixes(definition.node.init, sourceCode, seen)
  }
  if (definition.type !== 'Parameter') return []
  const forwarded = componentPropValues(definition, sourceCode, seen)
    .flatMap((candidate) => translatorPrefixes(candidate, sourceCode, new Set(seen)))
  return forwarded.length ? [...new Set(forwarded)] : ['']
}

function translationPrefixes(call, sourceCode) {
  const callee = unwrap(call)?.callee
  return callee?.type === 'Identifier' ? translatorPrefixes(callee, sourceCode) : []
}

function translatedCandidates(call, sourceCode) {
  const prefixes = translationPrefixes(call, sourceCode)
  const key = staticString(unwrap(call).arguments[0])
  if (prefixes.length === 0 || key === null) return []
  return prefixes.flatMap((prefix) => {
    const fullKey = prefix ? `${prefix}.${key}` : key
    return locales(sourceCode).flatMap(([locale, messages]) => {
      const label = localeValue(messages, fullKey)
      return label === null ? [] : [{ label, locale }]
    })
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

function nestedPropertyCandidates(node, path, sourceCode, seen = new Set(), skipIconAction = false) {
  if (path.length === 0) return sourceCandidates(node, sourceCode)

  const value = unwrap(node)
  if (!value || seen.has(value)) return []
  seen.add(value)

  if (value.type === 'Identifier') {
    return nestedPropertyCandidates(bindingValue(value, sourceCode), path, sourceCode, seen, skipIconAction)
  }
  if (value.type === 'CallExpression' && callName(value) === 'useMemo') {
    return nestedPropertyCandidates(functionResult(value.arguments[0]), path, sourceCode, seen, skipIconAction)
  }
  if (value.type === 'ObjectExpression') {
    if (skipIconAction && path.length === 1 && value.properties.some(
      (candidate) => candidate.type === 'Property' && getPropertyKeyName(candidate) === 'icon',
    )) return []
    const property = value.properties.find(
      (candidate) => candidate.type === 'Property' && getPropertyKeyName(candidate) === path[0],
    )
    return property?.type === 'Property'
      ? nestedPropertyCandidates(property.value, path.slice(1), sourceCode, seen, skipIconAction)
      : []
  }
  if (value.type === 'ConditionalExpression') {
    return [
      ...nestedPropertyCandidates(value.consequent, path, sourceCode, seen, skipIconAction),
      ...nestedPropertyCandidates(value.alternate, path, sourceCode, seen, skipIconAction),
    ]
  }
  if (value.type === 'LogicalExpression') {
    return [
      ...nestedPropertyCandidates(value.left, path, sourceCode, seen, skipIconAction),
      ...nestedPropertyCandidates(value.right, path, sourceCode, seen, skipIconAction),
    ]
  }
  return []
}

function attributeCandidates(openingElement, prop, sourceCode, skipIconAction = false) {
  const [attributeName, ...path] = prop.split('.')
  const attribute = getAttribute(openingElement, attributeName)
  if (!attribute) return []
  const value = getAttributeValueNode(attribute)
  return path.length === 0
    ? sourceCandidates(value, sourceCode)
    : nestedPropertyCandidates(value, path, sourceCode, new Set(), skipIconAction)
}

function isStaticallyIconOnly(openingElement) {
  const attribute = getAttribute(openingElement, 'iconOnly')
  if (!attribute) return false
  const value = getAttributeValueNode(attribute)
  return value === null || (value.type === 'Literal' && value.value === true)
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
                iconOnly: { type: 'boolean' },
                iconAction: { type: 'boolean' },
              },
              required: ['name'],
              additionalProperties: false,
            },
          },
          localePaths: {
            type: 'object',
            properties: { en: { type: 'string' }, 'pt-BR': { type: 'string' } },
            required: ['en', 'pt-BR'],
            additionalProperties: false,
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
    if (context.options[0]?.localePaths) localePathsBySourceCode.set(sourceCode, context.options[0].localePaths)

    return {
      JSXOpeningElement(openingElement) {
        const control = controls.find((candidate) =>
          candidate.name === getElementName(openingElement) && roleMatches(openingElement, candidate.roles),
        )
        if (!control) return

        const element = openingElement.parent
        const candidates = []
        for (const prop of control.labelProps ?? []) {
          if (control.iconOnly && prop === 'label' && isStaticallyIconOnly(openingElement)) continue
          candidates.push(...(prop === 'children'
            ? childCandidates(element, sourceCode)
            : attributeCandidates(openingElement, prop, sourceCode, control.iconAction && prop === 'action.label')))
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
