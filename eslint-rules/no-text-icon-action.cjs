const { childCandidates, isStaticallyIconOnly, getElementName } = require('./_control-labels.cjs')

const controls = new Set(['button', 'Button', 'PillButton', 'PillLink', 'Pressable', 'MotionPressable', 'InsetFocusPressable'])
const iconActions = /^(?:refresh|reload|retry|try again|close|cancel|add(?: reminder| deadline| sub-habit)?|new tag|edit|delete|remove|share(?: link| progress)?|copy|copied|download|search|settings|open settings|more|show more|show less|back|go back|next|previous|previous ideas|more ideas|expand|collapse|clear search|clear filter|clear checklist|top|atualizar|recarregar|tentar novamente|tentar de novo|fechar|cancelar|adicionar(?: lembrete| prazo| sub-hábito)?|nova tag|editar|excluir|apagar|remover|compartilhar(?: link| progresso)?|copiar|copiado|baixar|buscar|pesquisar|configurações|abrir configurações|mais|ver mais|ver menos|mostrar mais|mostrar menos|voltar|próximo|próxima|anterior|ideias anteriores|mais ideias|expandir|recolher|limpar busca|limpar filtro|limpar checklist|topo)$/iu

const drawnTextSurfaces = [
  {
    surface: 'drawn sheet footer dismissal',
    owners: [
      '/apps/web/components/ui/confirm-sheet.tsx',
      '/apps/mobile/components/ui/confirm-sheet.tsx',
      '/apps/web/components/habits/habit-create-actions.tsx',
      '/apps/mobile/components/habits/habit-create-actions.tsx',
      '/apps/web/components/habits/repeat-reminder-detail.tsx',
      '/apps/mobile/components/habits/repeat-reminder-detail.tsx',
      '/apps/web/components/habits/edit-habit-modal.tsx',
      '/apps/mobile/components/habits/edit-habit-modal.tsx',
      '/apps/web/components/goals/create-goal-sheet.tsx',
      '/apps/mobile/components/goals/create-goal-sheet.tsx',
      '/apps/web/components/goals/edit-goal-modal.tsx',
      '/apps/mobile/components/goals/edit-goal-modal.tsx',
      '/apps/web/components/goals/goal-detail-drawer/goal-progress-form.tsx',
      '/apps/mobile/components/goals/goal-detail-drawer/goal-progress-form.tsx',
      '/apps/web/components/habits/habit-list/move-parent-overlay.tsx',
      '/apps/mobile/components/habit-list/move-parent-dialog.tsx',
      '/apps/web/components/profile/profile-api-keys.tsx',
      '/apps/mobile/components/profile/profile-api-keys.tsx',
      '/apps/web/components/referral/referral-drawer.tsx',
      '/apps/mobile/components/referral/referral-drawer.tsx',
      '/apps/web/components/chat/pending-operation-card.tsx',
      '/apps/mobile/components/chat/pending-operation-card.tsx',
      '/apps/web/app/(app)/profile/_components/edit-name-sheet.tsx',
      '/apps/mobile/app/(tabs)/profile/_components/edit-name-sheet.tsx',
      '/apps/web/app/(app)/profile/_components/delete-account-modal.tsx',
      '/apps/mobile/app/(tabs)/profile/_components/delete-account-modal.tsx',
      '/apps/web/app/(app)/profile/_components/fresh-start-modal.tsx',
      '/apps/mobile/app/(tabs)/profile/_components/fresh-start-modal.tsx',
    ],
    labels: /^(?:cancel|cancelar)$/iu,
  },
  {
    surface: 'referral share consequence',
    owners: ['/apps/web/components/referral/referral-drawer.tsx', '/apps/mobile/components/referral/referral-drawer.tsx'],
    labels: /^(?:share link|compartilhar link)$/iu,
  },
  {
    surface: 'milestone sharing consequence',
    owners: ['/apps/web/components/milestone-share/milestone-share-prompt.tsx', '/apps/mobile/components/milestone-share/milestone-share-prompt.tsx'],
    labels: /^(?:share|compartilhar)$/iu,
  },
  {
    surface: 'milestone download consequence',
    owners: ['/apps/web/components/milestone-share/milestone-share-prompt.tsx'],
    labels: /^(?:download|baixar)$/iu,
  },
  {
    surface: 'notification deletion consequence',
    owners: ['/apps/web/components/navigation/notification-detail-modal.tsx', '/apps/mobile/components/navigation/notification-detail-modal.tsx'],
    labels: /^(?:delete|apagar)$/iu,
  },
  {
    surface: 'Wrapped pager',
    owners: ['/apps/web/components/ui/pager.tsx', '/apps/mobile/components/ui/pager.tsx'],
    labels: /^(?:back|voltar)$/iu,
  },
  {
    surface: 'Wrapped sharing',
    owners: ['/apps/web/app/(app)/wrapped/_components/wrapped-player.tsx', '/apps/mobile/components/wrapped/wrapped-player.tsx'],
    labels: /^(?:share|compartilhar|download|baixar)$/iu,
  },
]

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { icon: 'Use IconButton with a localized label for "{{label}}". Keep visible text for a flow-ending consequence or a drawn contextual action.' },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/')
    if (filename.includes('/__tests__/')) return {}
    const drawnSurfaces = drawnTextSurfaces.filter(({ owners }) => owners.some(owner => filename.endsWith(owner)))
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
        const match = labels.find(({ label }) => iconActions.test(label.trim()) && !drawnSurfaces.some(surface => surface.labels.test(label.trim())))
        if (match) context.report({ node: opening, messageId: 'icon', data: { label: match.label } })
      },
    }
  },
}
