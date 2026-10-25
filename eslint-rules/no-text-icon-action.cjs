const { childCandidates, isStaticallyIconOnly, getElementName } = require('./_control-labels.cjs')

const controls = new Set(['button', 'Button', 'PillButton', 'PillLink', 'Pressable', 'MotionPressable', 'InsetFocusPressable'])
const iconActions = /^(?:refresh|reload|retry|try again|close|cancel|add(?: reminder| deadline| sub-habit)?|new tag|edit|delete|remove|share(?: link| progress)?|copy|copied|download|search|settings|open settings|more|show more|show less|back|go back|next|previous|previous ideas|more ideas|expand|collapse|clear search|clear filter|clear checklist|top|atualizar|recarregar|tentar novamente|tentar de novo|fechar|cancelar|adicionar(?: lembrete| prazo| sub-hábito)?|nova tag|editar|excluir|remover|compartilhar(?: link| progresso)?|copiar|copiado|baixar|buscar|pesquisar|configurações|abrir configurações|mais|ver mais|ver menos|mostrar mais|mostrar menos|voltar|próximo|próxima|anterior|ideias anteriores|mais ideias|expandir|recolher|limpar busca|limpar filtro|limpar checklist|topo)$/iu

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { icon: 'Use IconButton with a localized label for "{{label}}". Keep visible text for a flow-ending consequence or a drawn contextual action.' },
  },
  create(context) {
    const names = new Set(controls)
    return {
      ImportDeclaration(node) {
        if (!node.source.value.endsWith('/pill-button')) return
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') names.add(specifier.local.name)
        }
      },
      JSXElement(node) {
        const opening = node.openingElement
        if (!names.has(getElementName(opening)) || isStaticallyIconOnly(opening)) return
        const labels = childCandidates(node, context.sourceCode, true)
        if (labels.some(({ label }) => !iconActions.test(label.trim()))) return
        const match = labels.find(({ label }) => iconActions.test(label.trim()))
        if (match) context.report({ node: opening, messageId: 'icon', data: { label: match.label } })
      },
    }
  },
}
