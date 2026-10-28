const { collectionCandidates, wordCount, childCandidates, attributeCandidates, isStaticallyIconOnly, roleMatches, localePathsBySourceCode, getAttribute, getAttributeValueNode, getElementName } = require('./_control-labels.cjs')

const MAX_CONTROL_WORDS = 2

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
