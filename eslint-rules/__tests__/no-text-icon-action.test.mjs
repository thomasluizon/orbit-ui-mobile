import { RuleTester } from 'eslint'
import parser from '@typescript-eslint/parser'
import { createRequire } from 'node:module'
import { afterAll, describe, it } from 'vitest'

const require = createRequire(import.meta.url)
RuleTester.describe = describe
RuleTester.it = it
RuleTester.afterAll = afterAll
const tester = new RuleTester({ languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } } })
const footerMessages = [require('../../packages/shared/src/i18n/en.json'), require('../../packages/shared/src/i18n/pt-BR.json')]

const sheetCancelOwners = ['web', 'mobile'].flatMap(platform => [
  ...['ui/confirm-sheet', 'habits/habit-create-actions', 'habits/edit-habit-modal', 'habits/repeat-reminder-detail', 'goals/create-goal-sheet', 'goals/edit-goal-modal', 'goals/goal-detail-drawer/goal-progress-form', 'profile/profile-api-keys', 'referral/referral-drawer', 'chat/pending-operation-card', platform === 'web' ? 'habits/habit-list/move-parent-overlay' : 'habit-list/move-parent-dialog'].map(owner => `/repo/apps/${platform}/components/${owner}.tsx`),
  ...['edit-name-sheet', 'fresh-start-modal', 'delete-account-modal'].map(owner => `/repo/apps/${platform}/app/(${platform === 'web' ? 'app' : 'tabs'})/profile/_components/${owner}.tsx`),
])
const drawnFooterActions = ['web', 'mobile'].flatMap(platform => [
  { filename: `/repo/apps/${platform}/components/referral/referral-drawer.tsx`, labels: footerMessages.map(messages => messages.referral.drawer.share) },
  { filename: `/repo/apps/${platform}/components/milestone-share/milestone-share-prompt.tsx`, labels: footerMessages.flatMap(messages => platform === 'web' ? [messages.milestoneShare.share, messages.milestoneShare.download] : [messages.milestoneShare.share]) },
  { filename: `/repo/apps/${platform}/components/navigation/notification-detail-modal.tsx`, labels: footerMessages.map(messages => messages.notifications.delete) },
])

tester.run('no-text-icon-action', require('../no-text-icon-action.cjs'), {
  valid: [
    ...sheetCancelOwners.flatMap(filename => ['Cancel', 'Cancelar'].map(label => ({ code: `<PillButton size="sm" variant="ghost">${label}</PillButton>`, filename }))),
    ...drawnFooterActions.flatMap(({ filename, labels }) => labels.map(label => ({ code: `<PillButton size="sm">${label}</PillButton>`, filename }))),
    ...['web', 'mobile'].flatMap(platform => [
      ...['Cancel', 'Cancelar'].map(label => ({ code: `<Button>${label}</Button>`, filename: `/repo/apps/${platform}/components/ui/confirm-sheet.tsx` })),
      ...['Back', 'Voltar'].map(label => ({ code: `<PillButton>${label}</PillButton>`, filename: `/repo/apps/${platform}/components/ui/pager.tsx` })),
      ...['Share', 'Compartilhar', 'Download', 'Baixar'].map(label => ({ code: `<PillButton>${label}</PillButton>`, filename: `/repo/apps/${platform}/${platform === 'web' ? 'app/(app)/wrapped/_components' : 'components/wrapped'}/wrapped-player.tsx` })),
    ]),
    { code: 'const fixture = <Button>Refresh</Button>', filename: '/repo/apps/web/__tests__/fixture.tsx' },
    '<IconButton label="Refresh"><RefreshCw /></IconButton>',
    '<Button iconOnly label="Close"><X /></Button>',
    '<Button>Delete habit</Button>',
    '<Button>Create goal</Button>',
    '<Button>Continue with Google</Button>',
    '<Button>Continue with Apple</Button>',
    '<button aria-label="Edit habit"><Pencil /></button>',
    'const { t } = useTranslation(); const action = <Button>{t("common.save")}</Button>',
  ],
  invalid: [
    ...[...new Set([...sheetCancelOwners, ...drawnFooterActions.map(({ filename }) => filename)])].map(filename => ({ code: '<PillButton>Refresh</PillButton>', filename, errors: [{ messageId: 'icon' }] })),
    ...drawnFooterActions.filter(({ filename }) => !filename.includes('/referral/')).map(({ filename }) => ({ code: '<PillButton>Cancel</PillButton>', filename, errors: [{ messageId: 'icon' }] })),
    ...['web', 'mobile'].flatMap(platform => [
      { code: '<PillButton>Cancel</PillButton>', filename: `/repo/apps/${platform}/components/ui/other-sheet.tsx`, errors: [{ messageId: 'icon' }] },
      { code: '<PillButton>Share</PillButton>', filename: `/repo/apps/${platform}/components/ui/pager.tsx`, errors: [{ messageId: 'icon' }] },
    ]),
    { code: 'const { t } = useTranslation(); const control = <Pressable>{() => <><Text>{t("common.retry")}</Text></>}</Pressable>', errors: [{ messageId: 'icon' }] },
    ...['Refresh', 'Close', 'Add', 'Edit', 'Delete', 'Share', 'Copy', 'Search', 'Settings', 'More', 'Back', 'Next', 'Previous', 'Expand', 'Atualizar', 'Fechar', 'Adicionar', 'Editar', 'Excluir', 'Apagar', 'Compartilhar', 'Copiar', 'Buscar', 'Configurações', 'Mais', 'Voltar', 'Próximo', 'Anterior', 'Expandir'].map(label => ({ code: `<Button>${label}</Button>`, errors: [{ messageId: 'icon' }] })),
    { code: 'const t = useTranslations("blockFrame"); const action = <Button>{t("refresh")}</Button>', errors: [{ messageId: 'icon' }] },
    { code: 'const { t } = useTranslation(); const action = <Pressable><Text>{t("common.retry")}</Text></Pressable>', errors: [{ messageId: 'icon' }] },
    { code: 'const { t } = useTranslation(); const action = <button>{t("common.close")}</button>', errors: [{ messageId: 'icon' }] },
    { code: 'import { Button as Action } from "@/components/ui/pill-button"; const action = <Action>Refresh</Action>', errors: [{ messageId: 'icon' }] },
    { code: 'const label = "Refresh"; const action = <Button>{label}</Button>', errors: [{ messageId: 'icon' }] },
  ],
})
