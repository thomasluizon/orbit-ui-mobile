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
    '<button className="hover:bg-[var(--bg-hover)] transition-[background-color,scale] duration-[var(--status-dot-press-duration)]" style={{ transitionDuration: "var(--dur-hover-control), var(--status-dot-press-duration)", transitionTimingFunction: "var(--ease-standard), var(--ease-out)" } as CSSProperties} />',
    '<button className="hover:bg-[var(--bg-hover)] [transition-property:background-color,box-shadow,scale]" style={{ transition: "background-color 380ms var(--ease-standard), box-shadow 380ms var(--ease-standard), scale 150ms var(--ease-out)" }} />',
    '<button data-fab="" className="transition-[background-color,transform] [transition-duration:var(--dur-hover-control),150ms] [transition-timing-function:var(--ease-standard),var(--ease-out)]" />',
    '<button className="hover:bg-[var(--bg-hover)] transition-[transform,background-color] [transition-duration:150ms,var(--dur-hover-control)] [transition-timing-function:cubic-bezier(0.16,1,0.3,1),var(--ease-standard)]" />',
    '<button className="hover:bg-[var(--bg-hover)] transition-[color,opacity,background-color] [transition-duration:var(--dur-hover-control),150ms] ease-[var(--ease-standard)]" />',
    '<button className="hover:bg-[var(--bg-hover)] transition-[background-color,transform] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]" />',
    '<div className="hover:bg-[var(--bg-hover)] transition-colors duration-[var(--dur-hover)] ease-[var(--ease-standard)]" />',
    '<button className="hover:bg-[var(--bg-hover)] transition-none duration-150 ease-out" />',
    '<button className="hover:bg-[var(--bg-hover)] habit-control-motion duration-[var(--dur-hover-control)]" />',
    '<button className="bg-[var(--bg-card)]" />',
    '<button className="hover:bg-[var(--bg-hover)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]" />',
    ...['transition', 'transition-colors', 'transition-all', 'transition-[color,background-color]', 'transition-[background]', 'transition-[all]'].map((transition) => `<button className="hover:bg-[var(--bg-hover)] ${transition} duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]" />`),
    '<button className="hover:bg-[var(--bg-hover)] [transition-property:background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]" />',
    '<div className="md:[&_button]:hover:bg-[var(--bg-hover)] md:[&_button]:[transition-property:background-color,color,opacity,scale] md:[&_button]:duration-[var(--dur-hover-control)] md:[&_button]:ease-[var(--ease-standard)]" />',
    '<div className="md:[&_button:enabled]:hover:bg-[var(--bg-hover)] md:[&_button]:[transition-property:background-color,color,opacity,scale] md:[&_button]:duration-[var(--dur-hover-control)] md:[&_button]:ease-[var(--ease-standard)]" />',
    '<button className={["hover:bg-[var(--bg-hover)]", "transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]"].join(" ")} />',
    '<button className={["hover:bg-[var(--bg-hover)]", "transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]"].filter(Boolean).join(" ")} />',
    '<button className={`hover:bg-[var(--bg-hover)] ${ready ? "transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]" : "transition-none"}`} />',
    '<button className={ready ? "hover:bg-[var(--bg-hover)] transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]" : "bg-transparent"} />',
    '<button className={[ready ? "hover:bg-[var(--bg-hover)]" : "", "transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]"].join(" ")} />',
    '<button className="enabled:hover:bg-[var(--bg-hover)] !transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]" />',
    ...['habit-control-motion', 'orbit-pill-action', 'orbit-list-row', 'orbit-list-row-body', 'orbit-list-row-action', 'orbit-menu-item', 'chip'].map((motion) => `<button className="hover:bg-[var(--bg-hover)] ${motion}" />`),
    '<span className="group-hover:bg-[var(--bg-hover)] transition-none" />',
    '<button className="hover:bg-[var(--bg-hover)] motion-safe:transition-colors motion-safe:duration-[var(--dur-hover-control)] motion-safe:ease-[var(--ease-standard)]" />',
  ],
  invalid: [
    { code: '<button className="hover:bg-[var(--bg-hover)] transition-[background-color,scale] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]" style={{ transitionDuration: "150ms, var(--dur-hover-control)" }} />', errors: [{ messageId: 'duration' }] },
    { code: '<button className="hover:bg-[var(--bg-hover)] habit-control-motion" style={{ transition: "background-color 240ms ease-out, scale 150ms var(--ease-out)" }} />', errors: [{ messageId: 'timing' }] },
    ...['duration-150', 'duration-200', 'duration-[var(--dur-fast)]', '[transition-duration:150ms]', '[transition-duration:150ms,var(--dur-hover-control)]'].map((duration) => ({ code: `<button className="hover:bg-[var(--bg-hover)] transition-[background-color,transform] ${duration} ease-[var(--ease-standard)]" />`, errors: [{ messageId: 'duration' }] })),
    ...['ease-out', 'ease-linear', 'ease-[var(--ease-out)]', '[transition-timing-function:var(--ease-out),var(--ease-standard)]'].map((timing) => ({ code: `<button className="hover:bg-[var(--bg-hover)] transition-[background-color,transform] duration-[var(--dur-hover-control)] ${timing}" />`, errors: [{ messageId: 'timing' }] })),
    { code: '<button className="hover:bg-[var(--bg-hover)] transition-colors ease-[var(--ease-standard)]" />', errors: [{ messageId: 'duration' }] },
    { code: '<button className="hover:bg-[var(--bg-hover)] habit-control-motion duration-150" />', errors: [{ messageId: 'duration' }] },
    { code: '<button className="hover:bg-[var(--bg-hover)] habit-control-motion ease-out" />', errors: [{ messageId: 'timing' }] },
    { code: '<button className={`hover:bg-[var(--bg-hover)] transition-colors duration-[var(--dur-hover-control)] ${ready ? "ease-[var(--ease-standard)]" : "ease-out"}`} />', errors: [{ messageId: 'timing' }] },
    { code: '<div className="md:[&_button]:hover:bg-[var(--bg-hover)] md:[&_button]:transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]" />', errors: [{ messageId: 'duration' }] },
    { code: '<button className="hover:bg-[var(--bg-hover)] transition-colors duration-[var(--dur-hover-control)] hover:ease-[var(--ease-standard)]" />', errors: [{ messageId: 'timing' }] },
    { code: '<button data-fab="" className="transition-[background-color,transform] [transition-duration:var(--dur-hover-control),150ms] ease-out active:scale-[0.96]" />', errors: [{ messageId: 'timing' }] },
    { code: '<button className="hover:bg-[var(--primary-hover)] transition-[background-color,opacity] duration-150" />', errors: [{ messageId: 'duration' }] },
    { code: '<button className="hover:bg-[var(--bg-hover)] transition-[background-color] duration-[var(--dur-hover-control)]" />', errors: [{ messageId: 'timing' }] },
    { code: '<button className="transition-[background-color,color,box-shadow,transform] [transition-duration:var(--dur-hover-control),var(--dur-hover-control),var(--dur-hover-control),150ms] hover:bg-[var(--bg-hover)]" />', errors: [{ messageId: 'timing' }] },
    { code: '<button className="hover:bg-[var(--bg-hover)] transition-[transform,background-color] [transition-duration:var(--dur-hover-control),150ms] [transition-timing-function:var(--ease-out),var(--ease-standard)]" />', errors: [{ messageId: 'duration' }] },
    { code: '<button className="hover:bg-[var(--bg-hover)] transition-[transform,background-color] [transition-duration:150ms,var(--dur-hover-control)] [transition-timing-function:var(--ease-standard),var(--ease-out)]" />', errors: [{ messageId: 'timing' }] },
    ...['transition-opacity', 'transition-transform', 'transition-shadow', 'transition-[opacity,transform]', '[transition-property:opacity]', '[&_span]:transition-colors', '[&_span]:transition-none', '[&_span]:habit-control-motion', 'focus:transition-colors', 'orbit-list-row-form', 'orbit-list-row-control'].map((transition) => ({ code: `<button className="hover:bg-[var(--bg-hover)] ${transition}" />`, errors: [{ messageId: 'missing' }] })),
    { code: '<button className={ready ? "hover:bg-[var(--bg-hover)]" : "transition-colors"} />', errors: [{ messageId: 'missing' }] },
    { code: '<button className={`hover:bg-[var(--bg-hover)] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] ${ready ? "transition-colors" : "transition-opacity"}`} />', errors: [{ messageId: 'missing' }] },
    { code: '<button className={["hover:bg-[var(--bg-hover)]", ready && "transition-colors"].join(" ")} />', errors: [{ messageId: 'missing' }] },
    { code: '<button className={[ready ? "hover:bg-[var(--bg-hover)]" : "transition-colors"].filter(Boolean).join(" ")} />', errors: [{ messageId: 'missing' }] },
    { code: '<div className="md:[&_button]:hover:bg-[var(--bg-hover)] transition-colors" />', errors: [{ messageId: 'missing' }] },
    { code: '<div className="md:[&_button]:hover:bg-[var(--bg-hover)] md:[&_button:enabled]:transition-colors" />', errors: [{ messageId: 'missing' }] },
    { code: '<div className="md:[&_button:enabled]:hover:bg-[var(--bg-hover)] md:[&_span]:transition-colors" />', errors: [{ messageId: 'missing' }] },
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
