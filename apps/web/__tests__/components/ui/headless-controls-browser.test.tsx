import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { bundleGeometry } from '@/__tests__/support/profile-settings-browser'

const entry = `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { NextIntlClientProvider } from 'next-intl';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { profileKeys } from '../../packages/shared/src/query/keys';
  import en from '../../packages/shared/src/i18n/en.json';
  import { HabitCreateActions } from './components/habits/habit-create-actions';
  import { Sheet } from './components/ui/sheet';
  import { Select } from './components/ui/select';
  import { RadioGroup } from './components/ui/radio-group';
  import { RadioRow } from './components/ui/select-check';
  import { PendingOperationCard } from './components/chat/pending-operation-card';
  import { makeParentChoicePreview, resolveParentChoicePreview } from '../../packages/shared/src/test-support/pending-operation-preview-fixtures';
  function Example() {
    const [value, setValue] = useState('a');
    const [busy, setBusy] = useState(false);
    const [count, setCount] = useState(0);
    const root = document.getElementById('root');
    if (root.dataset.surface === 'submit') return <Sheet title="Create habit" actions={<HabitCreateActions presentation="sheet" formId="habit" online pending={false} empty={false} subHabit={false} onCancel={() => {}} />}><form id="habit" onSubmit={event => {event.preventDefault(); root.dataset.calls = String(Number(root.dataset.calls || 0) + 1);}}><textarea aria-label="Title" /><input aria-label="Date phrase" /><RadioGroup aria-label="Type"><RadioRow label="Task" /><RadioRow label="Habit" selected /></RadioGroup></form></Sheet>;
    if (root.dataset.surface === 'select') return <Sheet title="Reminders" onClose={() => {}} actions={<button>Save</button>}>
      <input aria-label="Count" /><Select label="Units" value={value} onChange={setValue} options={[{value:'a',label:'Alpha'},{value:'b',label:'Beta'},{value:'c',label:'Charlie'}]} />
    </Sheet>;
    if (root.dataset.surface === 'radio') return <><button onClick={() => setBusy(!busy)}>Busy</button><output>{count}</output><RadioGroup aria-label="Options" onCommit={() => setCount(count + 1)}>
      <RadioRow label="First" selected={value === 'a'} busy={busy} onSelect={() => setValue('a')} />
      <RadioRow label="Second" selected={value === 'b'} busy={busy} onSelect={() => setValue('b')} />
      <RadioRow label="Unavailable" disabled />
    </RadioGroup></>;
    const operation = makeParentChoicePreview(Number(root.dataset.count));
    return <><button>Elsewhere</button><PendingOperationCard pendingOperation={operation} onConfirmExecute={async () => ({ok:true})}
      onRevise={async () => { root.dataset.calls = String(Number(root.dataset.calls || 0) + 1); return new Promise(resolve => {
        document.addEventListener('settle', event => resolve(event.detail === 'failure' ? {ok:false,error:'option_not_offered'} : {ok:true,result:{isSuccess:true,error:null,pendingOperationId:operation.id,preview:{...resolveParentChoicePreview(operation,'0',null),changes:[],changeTargetCount:operation.changeTargetCount},cancelled:false}}), {once:true});
      }); }} /></>;
  }
  const profileClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  profileClient.setQueryData(profileKeys.detail(), { timeZone: 'UTC' });
  createRoot(document.getElementById('root')).render(<QueryClientProvider client={profileClient}><NextIntlClientProvider locale="en" messages={en} timeZone="UTC"><Example /></NextIntlClientProvider></QueryClientProvider>);
`

describe('mounted headless controls', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let script: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    script = bundleGeometry(entry, {
      '@sentry/nextjs': "export * from '@sentry/react';",
      '@/hooks/use-time-format': 'export const useTimeFormat = () => ({displayTime: value => value});',
      'next/navigation': "export { unstable_isUnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'; export const useRouter = () => ({push: () => {}});",
    })
  }, 60_000)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it('anchors select content inside the modal subtree with production sheet CSS', async () => {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'reduce' })
    try {
      await page.setContent(`<style>${stylesheet}</style><div id="root" data-surface="select"></div>`)
      await page.addScriptTag({ content: script })
      await page.getByRole('textbox', { name: 'Count' }).fill('2')
      const trigger = page.getByRole('combobox', { name: 'Units' })
      await trigger.click()
      const popup = page.getByRole('listbox')
      await popup.waitFor()
      await expect.poll(() => popup.evaluate(element => Math.abs(element.getBoundingClientRect().left - document.querySelector('[role="combobox"]')!.getBoundingClientRect().left))).toBeLessThanOrEqual(1)
      const geometry = await popup.evaluate(element => {
        const trigger = document.querySelector('[role="combobox"]')!.getBoundingClientRect()
        const popup = element.getBoundingClientRect()
        return { trigger: trigger.toJSON(), popup: popup.toJSON(), modal: element.closest('[role="dialog"]') !== null, hidden: element.closest('[aria-hidden="true"], [inert]') !== null }
      })
      expect(geometry.modal).toBe(true)
      expect(geometry.hidden).toBe(false)
      expect(Math.abs(geometry.popup.left - geometry.trigger.left)).toBeLessThanOrEqual(1)
      expect(geometry.popup.width).toBeGreaterThanOrEqual(geometry.trigger.width)
      const gap = Math.min(Math.abs(geometry.popup.top - geometry.trigger.bottom), Math.abs(geometry.trigger.top - geometry.popup.bottom))
      expect(gap).toBeCloseTo(8, 0)
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('c')
      await expect.poll(() => page.getByRole('option', { name: 'Charlie' }).evaluate(element => document.activeElement === element)).toBe(true)
      await page.keyboard.press('Enter')
      await expect.poll(() => trigger.textContent()).toContain('Charlie')
      await trigger.click()
      await page.keyboard.press('Escape')
      expect(await page.getByRole('dialog', { name: 'Reminders' }).count()).toBe(1)
      await expect.poll(() => trigger.evaluate(element => document.activeElement === element)).toBe(true)
    } finally { await page.close() }
  })

  it('submits the sheet form once on Enter through its associated footer action', async () => {
    const page = await browser.newPage({ reducedMotion: 'reduce' })
    try {
      await page.setContent(`<style>${stylesheet}</style><div id="root" data-surface="submit"></div>`)
      await page.addScriptTag({ content: script })
      await page.getByRole('textbox', { name: 'Date phrase' }).fill('after vacation')
      await page.keyboard.press('Enter')
      await expect.poll(() => page.locator('#root').getAttribute('data-calls')).toBe('1')
    } finally { await page.close() }
  })

  it('retains a busy radio without selecting, committing or navigating', async () => {
    const page = await browser.newPage({ reducedMotion: 'reduce' })
    try {
      await page.setContent(`<style>${stylesheet}</style><div id="root" data-surface="radio"></div>`)
      await page.addScriptTag({ content: script })
      const first = page.getByRole('radio', { name: 'First' })
      await first.focus()
      await page.getByRole('button', { name: 'Busy' }).evaluate(element => (element as HTMLButtonElement).click())
      await expect.poll(() => first.getAttribute('aria-disabled')).toBe('true')
      expect(await first.evaluate(element => document.activeElement === element)).toBe(true)
      expect(await first.isDisabled()).toBe(true)
      expect(await first.getAttribute('disabled')).toBeNull()
      for (const key of ['ArrowDown', 'ArrowRight', 'Home', 'End', 'Enter', 'Space']) await page.keyboard.press(key)
      await first.evaluate(element => (element as HTMLButtonElement).click())
      expect(await first.evaluate(element => document.activeElement === element)).toBe(true)
      expect(await first.getAttribute('aria-checked')).toBe('true')
      expect(await page.locator('output').textContent()).toBe('0')
      await page.getByRole('button', { name: 'Busy' }).evaluate(element => (element as HTMLButtonElement).click())
      await expect.poll(() => first.getAttribute('aria-disabled')).toBeNull()
      await page.keyboard.press('ArrowDown')
      await expect.poll(() => page.getByRole('radio', { name: 'Second' }).getAttribute('aria-checked')).toBe('true')
      await page.keyboard.press('Enter')
      expect(await page.locator('output').textContent()).toBe('1')
      expect(await page.getByRole('radio', { name: 'Unavailable' }).getAttribute('aria-disabled')).toBe('true')
    } finally { await page.close() }
  })

  it.each([{ count: 2, outcome: 'success' }, { count: 1, outcome: 'success' }, { count: 2, outcome: 'failure' }, { count: 2, outcome: 'outside' }])('recovers ParentChoice focus after $outcome with $count items', async ({ count, outcome }) => {
    const page = await browser.newPage({ reducedMotion: 'reduce' })
    try {
      await page.route('https://orbit.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }))
      await page.goto('https://orbit.test/')
      await page.setContent(`<style>${stylesheet}</style><div id="root" data-surface="parent" data-count="${count}"></div>`)
      await page.addScriptTag({ content: script })
      const chosen = page.getByRole('radio').first()
      await chosen.focus()
      await page.keyboard.press('Enter')
      await expect.poll(() => chosen.getAttribute('aria-disabled')).toBe('true')
      expect(await chosen.evaluate(element => document.activeElement === element)).toBe(true)
      for (const key of ['ArrowDown', 'End', 'Enter', 'Space']) await page.keyboard.press(key)
      expect(await page.locator('#root').getAttribute('data-calls')).toBe('1')
      if (outcome === 'outside') await page.getByRole('button', { name: 'Elsewhere' }).focus()
      await page.evaluate(result => document.dispatchEvent(new CustomEvent('settle', { detail: result })), outcome)
      await expect.poll(() => page.getByRole('radiogroup').count()).toBe(outcome === 'failure' ? 2 : count - 1)
      const target = outcome === 'outside' ? page.getByRole('button', { name: 'Elsewhere' })
        : outcome === 'failure' || count === 2 ? page.getByRole('radio').first() : page.getByRole('button', { name: 'Create 1 habit', exact: true })
      await expect.poll(() => target.evaluate(element => document.activeElement === element)).toBe(true)
      expect(await page.getByRole('radiogroup').count()).toBe(outcome === 'failure' ? 2 : count - 1)
    } finally { await page.close() }
  })
})
