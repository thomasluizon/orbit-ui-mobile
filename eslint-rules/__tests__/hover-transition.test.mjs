import { RuleTester } from 'eslint'
import parser from '@typescript-eslint/parser'
import { createRequire } from 'node:module'
import { afterAll, describe, it } from 'vitest'

const require = createRequire(import.meta.url)
RuleTester.describe = describe
RuleTester.it = it
RuleTester.afterAll = afterAll
const tester = new RuleTester({ languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } } })

tester.run('hover-transition', require('../hover-transition.cjs'), {
  valid: [
    '<button className="bg-[var(--bg-card)]" />',
    '<button className="hover:bg-[var(--bg-hover)] transition-[background-color]" />',
    '<button className="hover:bg-[var(--bg-hover)] [transition-property:background-color]" />',
    '<div className="md:[&_button]:hover:bg-[var(--bg-hover)] md:[&_button]:[transition-property:background-color,color,opacity,scale]" />',
    '<button className={["hover:bg-[var(--bg-hover)]", "transition-colors"].join(" ")} />',
    '<button className={["hover:bg-[var(--bg-hover)]", "transition-colors"].filter(Boolean).join(" ")} />',
    '<button className={`hover:bg-[var(--bg-hover)] ${ready ? "transition-colors" : "transition-none"}`} />',
    ...['habit-control-motion', 'orbit-pill-action', 'orbit-list-row', 'orbit-list-row-control', 'orbit-menu-item', 'chip'].map((motion) => `<button className="hover:bg-[var(--bg-hover)] ${motion}" />`),
    '<span className="group-hover:bg-[var(--bg-hover)] transition-none" />',
    '<button className="hover:bg-[var(--bg-hover)] motion-safe:transition-colors" />',
  ],
  invalid: [
    { code: '<button className="hover:bg-[var(--bg-hover)]" />', errors: [{ messageId: 'missing' }] },
    { code: '<span className="group-hover:bg-[var(--bg-hover)]" />', errors: [{ messageId: 'missing' }] },
    { code: '<span className="group-hover/card:bg-[var(--bg-hover)]" />', errors: [{ messageId: 'missing' }] },
    { code: '<button className={ready ? "enabled:hover:bg-[var(--bg-hover)]" : "bg-transparent"} />', errors: [{ messageId: 'missing' }] },
    { code: '<button className={`hover:bg-[var(--bg-hover)] ${tone}`} />', errors: [{ messageId: 'missing' }] },
    { code: '<button className={["hover:bg-[var(--bg-hover)]", "duration-200"].join(" ")} />', errors: [{ messageId: 'missing' }] },
    { code: '<button className="hover:bg-[var(--bg-hover)] hover:transition-colors" />', errors: [{ messageId: 'missing' }] },
    { code: '<button className="hover:bg-[var(--bg-hover)] hover:[transition-property:background-color]" />', errors: [{ messageId: 'missing' }] },
    { code: '<button className="hover:bg-[var(--bg-hover)] habit-control-motionless" />', errors: [{ messageId: 'missing' }] },
    { code: '<div className="transition-colors"><button className="hover:bg-[var(--bg-hover)]" /></div>', errors: [{ messageId: 'missing' }] },
  ],
})
