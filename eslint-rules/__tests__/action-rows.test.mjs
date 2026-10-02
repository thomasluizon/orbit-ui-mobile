import { RuleTester } from 'eslint'
import parser from '@typescript-eslint/parser'
import { createRequire } from 'node:module'
import { afterAll, describe, it } from 'vitest'

const require = createRequire(import.meta.url)
RuleTester.describe = describe
RuleTester.it = it
RuleTester.afterAll = afterAll
const tester = new RuleTester({ languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } } })
const imports = "import { PillButton as Pill, PillLink } from '@/components/ui/pill-button'; import { ActionRow as Row } from '@/components/ui/action-row';"

tester.run('action-rows', require('../action-rows.cjs'), {
  valid: [
    `${imports} const actions = <Row><Pill variant="ghost">Cancel</Pill><Pill>Save</Pill></Row>`,
    `${imports} const action = <div>{pending ? <Pill>Save</Pill> : <Pill>Retry</Pill>}</div>`,
    { code: `${imports} const action = <Pill size="md">Create</Pill>`, filename: '/repo/apps/web/components/habits/habit-create-actions.tsx' },
    `${imports} const action = <Pill size="sm">Save</Pill>`,
  ],
  invalid: [
    { code: `${imports} const actions = <div><Pill>Save</Pill><Pill variant="ghost">Cancel</Pill></div>`, errors: [{ messageId: 'row' }] },
    { code: `${imports} const actions = <div>{ready ? <><Pill>Save</Pill><PillLink href="/">Back</PillLink></> : null}</div>`, errors: [{ messageId: 'row' }] },
    { code: `${imports} const actions = <div>{items.map(item => <Pill>{item}</Pill>)}</div>`, errors: [{ messageId: 'row' }] },
    { code: `${imports} const actions = <div>{items.map(item => { const label = item.name; return <Pill>{label}</Pill> })}</div>`, errors: [{ messageId: 'row' }] },
    { code: `${imports} const action = <Pill size="md">Save</Pill>`, errors: [{ messageId: 'medium' }] },
    { code: `${imports} const action = <Pill size={size}>Save</Pill>`, errors: [{ messageId: 'medium' }] },
    { code: `${imports} const actions = <Row><Pill size="md">Save</Pill></Row>`, filename: '/repo/apps/web/components/habits/habit-create-actions.tsx', errors: [{ messageId: 'rowSize' }] },
  ],
})
