import { RuleTester } from 'eslint'
import parser from '@typescript-eslint/parser'
import { createRequire } from 'node:module'
import { afterAll, describe, it } from 'vitest'

const require = createRequire(import.meta.url)
RuleTester.describe = describe
RuleTester.it = it
RuleTester.afterAll = afterAll
const tester = new RuleTester({ languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } } })

tester.run('no-text-icon-action', require('../no-text-icon-action.cjs'), {
  valid: [
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
    { code: 'const { t } = useTranslation(); const control = <Pressable>{() => <><Text>{t("common.retry")}</Text></>}</Pressable>', errors: [{ messageId: 'icon' }] },
    ...['Refresh', 'Close', 'Add', 'Edit', 'Delete', 'Share', 'Copy', 'Search', 'Settings', 'More', 'Back', 'Next', 'Previous', 'Expand', 'Atualizar', 'Fechar', 'Adicionar', 'Editar', 'Excluir', 'Compartilhar', 'Copiar', 'Buscar', 'Configurações', 'Mais', 'Voltar', 'Próximo', 'Anterior', 'Expandir'].map(label => ({ code: `<Button>${label}</Button>`, errors: [{ messageId: 'icon' }] })),
    { code: 'const t = useTranslations("blockFrame"); const action = <Button>{t("refresh")}</Button>', errors: [{ messageId: 'icon' }] },
    { code: 'const { t } = useTranslation(); const action = <Pressable><Text>{t("common.retry")}</Text></Pressable>', errors: [{ messageId: 'icon' }] },
    { code: 'const { t } = useTranslation(); const action = <button>{t("common.close")}</button>', errors: [{ messageId: 'icon' }] },
    { code: 'import { Button as Action } from "@/components/ui/pill-button"; const action = <Action>Refresh</Action>', errors: [{ messageId: 'icon' }] },
    { code: 'const label = "Refresh"; const action = <Button>{label}</Button>', errors: [{ messageId: 'icon' }] },
  ],
})
