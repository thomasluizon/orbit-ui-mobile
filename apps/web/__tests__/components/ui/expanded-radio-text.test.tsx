// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import type axe from 'axe-core'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

const token = `${'longaddress'.repeat(12)}@example.com`
const labels = [token, `Read ${token} daily`]

describe('expanded RadioRow personal text in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let componentScript: string
  const axeScript = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    const result = await build({
      stdin: {
        contents: `import React, { useLayoutEffect, useState } from 'react';
          import { createRoot } from 'react-dom/client';
          import { RadioGroup } from './components/ui/radio-row';
          import { RadioRow } from './components/ui/select-check';
          import { ListRow } from './components/ui/list-row';
          import { PersonalTextDetails } from './components/ui/personal-text-details';
          import { HabitRow } from './components/habits/habit-row';
          import { createMockHabit } from '../../packages/shared/src/__tests__/factories';
          import { SupportReplyEmail } from './app/(app)/support/_components/support-reply-email';
          import { NextIntlClientProvider } from 'next-intl';
          import messages from '../../packages/shared/src/i18n/en.json';
          function Subjects() {
            const [selected, select] = useState(0);
            const label = document.getElementById('root').dataset.label;
            const composition = document.getElementById('root').dataset.composition;
            useLayoutEffect(() => {
              requestAnimationFrame(() => {
                const root = document.getElementById('root');
                const scroller = [...root.querySelectorAll('[data-personal-text], [data-personal-text] > span')].find(element => element.scrollWidth > element.clientWidth);
                root.dataset.firstFrameOverflow = String(Boolean(scroller));
                root.dataset.firstFrameTabIndex = scroller?.getAttribute('tabindex') ?? 'missing';
              });
            }, []);
            if (composition === 'support') return <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><SupportReplyEmail email={label} /></NextIntlClientProvider>;
            if (composition === 'habit') return <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><HabitRow habit={createMockHabit({ title: label })} selectMode selected hasChildren childProgress={{ done: 0, total: 2 }} meta={['0 of 2', { kind: 'overdue', label: 'Overdue' }]} /></NextIntlClientProvider>;
            if (composition === 'settingsMetadata') return <ListRow accessibilityLabel={label} title={label} textMode="personal" description="Details" trailing={<span>Value</span>} />;
            if (composition === 'settingsImage') return <ListRow title={label} textMode="personal" trailing={<span role="img" aria-label="Special value" />} />;
            if (composition === 'settingsRegion') return <ListRow title={label} textMode="personal" trailing={<span role="region" aria-label="Additional information"><span>{label}</span></span>} />;
            if (composition === 'settingsEvolvingRegion') return <><ListRow title={label} textMode="personal" trailing={<span role={selected ? 'region' : undefined} aria-label={selected ? 'Additional information' : undefined}><span>{label}</span></span>}/><button onClick={() => select(1)}>Show details</button></>;
            if (composition === 'settingsEvolvingLink') return <><ListRow title={label} textMode="personal" trailing={<a href={selected ? '/details' : undefined}>{label}</a>}/><button onClick={() => select(1)}>Show details</button></>;
            if (composition === 'settingsEvolvingEditor') return <><ListRow title={label} textMode="personal" trailing={<span contentEditable={selected ? true : undefined} suppressContentEditableWarning>{label}</span>}/><button onClick={() => select(1)}>Show details</button></>;
            if (composition === 'settingsGroupMetadata') return <ListRow accessibilityLabel={label} title={label} textMode="personal" description="Details" />;
            if (composition === 'disabledRadio') return <RadioRow label={label} textMode="personal" disabled />;
            if (composition === 'disabledList') return <ListRow title={label} textMode="personal" personalExpanded disabled />;
            if (composition === 'list') return <ListRow title={label} textMode="personal" />;
            if (composition === 'settings') return <ListRow title={label} textMode="personal" />;
            if (composition === 'settingsGroup') return <ListRow title={label} textMode="personal" />;
            if (composition === 'details') return <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><PersonalTextDetails>{label}</PersonalTextDetails></NextIntlClientProvider>;
            return <RadioGroup aria-label="Subjects" onCommit={() => document.getElementById('commits').textContent += 'commit'}>
              <RadioRow label={label} textMode="personal" selected={selected === 0} onSelect={() => select(0)} />
              <RadioRow label="Second" selected={selected === 1} onSelect={() => select(1)} />
            </RadioGroup>;
          }
          createRoot(document.getElementById('root')).render(<Subjects />);`,
        resolveDir: process.cwd(), loader: 'tsx',
      },
      bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    })
    componentScript = result.outputFiles[0]!.text
  }, 30_000)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  async function mount(label: string, mode: 'light' | 'dark' = 'light', composition = 'radio') {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 }, reducedMotion: 'reduce' })
    const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([name, value]) => `${name}:${value}`).join(';')
    await page.setContent(`<!doctype html><html lang="en" class="${mode}"><head><title>Subjects</title><style>${stylesheet}\n:root{${variables}}</style></head><body><main><div id="root"></div><output id="commits"></output></main></body></html>`)
    await page.locator('#root').evaluate((root, text) => { (root as HTMLElement).dataset.label = text }, label)
    await page.locator('#root').evaluate((root, kind) => { (root as HTMLElement).dataset.composition = kind }, composition)
    await page.addScriptTag({ content: componentScript })
    await page.getByRole(composition === 'radio' ? 'radio' : 'button', { name: label, exact: !['support', 'habit'].includes(composition) }).waitFor()
    await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))))
    return page
  }

  const cases = labels.flatMap((label) => (['light', 'dark'] as const).map((mode) => ({ label, mode })))
  it.each(cases)('keeps all four sides of the focused outline clear in $mode for $label', async ({ label, mode }) => {
    const page = await mount(label, mode)
    try {
      const overflowing = page.locator('[data-personal-text], [data-personal-text] > span')
      const handle = await overflowing.evaluateAll((elements) => elements.findIndex((element) => element.scrollWidth > element.clientWidth))
      const text = overflowing.nth(handle)
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      expect(await text.evaluate((element) => document.activeElement === element)).toBe(true)
      await expect.poll(() => text.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe('2px')
      const outline = await text.evaluate((element) => {
        const style = getComputedStyle(element)
        const bounds = element.getBoundingClientRect()
        const outset = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset)
        const clips: string[] = []
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const ancestorStyle = getComputedStyle(parent)
          const rectangle = parent.getBoundingClientRect()
          const left = rectangle.left + parent.clientLeft
          const top = rectangle.top + parent.clientTop
          const clipping = /^(auto|scroll|hidden|clip)$/u
          if (clipping.test(ancestorStyle.overflowX) && (bounds.left - outset < left - 1 || bounds.right + outset > left + parent.clientWidth + 1)) clips.push(`${parent.tagName}:x`)
          if (clipping.test(ancestorStyle.overflowY) && (bounds.top - outset < top - 1 || bounds.bottom + outset > top + parent.clientHeight + 1)) clips.push(`${parent.tagName}:y`)
          if (parent.getAttribute('role') === 'radiogroup') break
        }
        return { width: style.outlineWidth, offset: style.outlineOffset, style: style.outlineStyle, shadow: style.boxShadow, clips, visible: element.matches(':focus-visible'), color: style.outlineColor, primary: style.getPropertyValue('--primary') }
      })
      expect(outline.width, JSON.stringify(outline)).toBe('2px')
      expect(outline.offset).toBe('2px')
      expect(outline.style).toBe('solid')
      expect(outline.shadow).toBe('none')
      expect(outline.clips).toEqual([])
    } finally { await page.close() }
  })

  it.each(labels)('makes overflowing text keyboard reachable on its first frame for %s', async (label) => {
    const page = await mount(label)
    try {
      expect(await page.locator('#root').getAttribute('data-first-frame-overflow')).toBe('true')
      expect(await page.locator('#root').getAttribute('data-first-frame-tab-index')).toBe('0')
    } finally { await page.close() }
  })

  it.each(labels)('gives only the overflowing text a named tab stop and keeps radio navigation separate for %s', async (label) => {
    const page = await mount(label)
    try {
      const text = page.locator('[data-personal-text], [data-personal-text] > span')
      const overflowIndex = await text.evaluateAll((elements) => elements.findIndex((element) => element.scrollWidth > element.clientWidth))
      const overflowing = text.nth(overflowIndex)
      expect(await overflowing.getAttribute('tabindex')).toBe('0')
      expect(await overflowing.getAttribute('aria-label')).toBe(label)
      await page.keyboard.press('Tab')
      expect(await page.getByRole('radio', { name: label, exact: true }).evaluate((element) => document.activeElement === element)).toBe(true)
      await page.keyboard.press('Tab')
      expect(await overflowing.evaluate((element) => document.activeElement === element)).toBe(true)
      await page.keyboard.press('ArrowRight')
      await expect.poll(() => overflowing.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
      expect(await page.getByRole('radio', { name: label, exact: true }).getAttribute('aria-checked')).toBe('true')
      expect(await page.locator('#commits').textContent()).toBe('')
      await page.getByRole('radio', { name: label, exact: true }).focus()
      await page.keyboard.press('ArrowDown')
      expect(await page.getByRole('radio', { name: 'Second', exact: true }).getAttribute('aria-checked')).toBe('true')
      expect(await page.getByRole('radio', { name: 'Second', exact: true }).evaluate((element) => document.activeElement === element)).toBe(true)
      expect(await page.locator('[data-personal-text] [tabindex="0"], [data-personal-text][tabindex="0"]').count()).toBe(0)
    } finally { await page.close() }
  })

  it.each(labels)('passes axe with all five WCAG tags for %s', async (label) => {
    const page = await mount(label)
    try {
      await page.addScriptTag({ content: axeScript })
      const violations = await page.evaluate(async () => {
        const results = await (window as typeof window & { axe: typeof axe }).axe.run(document.querySelector('main')!, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        })
        return results.violations.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target) }))
      })
      expect(violations).toEqual([])
    } finally { await page.close() }
  })

  it.each(labels.flatMap((label) => ['list', 'details', 'settings', 'settingsGroup', ...(label === token ? ['support'] : [])].map((composition) => ({ label, composition }))))('keeps expanded $composition actions separate from scrolling for $label', async ({ label, composition }) => {
    const page = await mount(label, 'light', composition)
    try {
      await page.getByRole('button', { name: label, exact: composition !== 'support' }).click()
      const text = page.getByRole('region', { name: label, exact: true })
      await text.waitFor()
      expect(await text.getAttribute('tabindex')).toBe('0')
      expect(await text.evaluate((element) => element.closest('button, a, [role="radio"]'))).toBeNull()
      await page.addScriptTag({ content: axeScript })
      const violations = await page.evaluate(async () => {
        const results = await (window as typeof window & { axe: typeof axe }).axe.run(document.querySelector('main')!, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        })
        return results.violations.map((violation) => violation.id)
      })
      expect(violations).toEqual([])
      await page.getByRole('button', { name: label, exact: composition !== 'support' }).focus()
      await page.keyboard.press('Enter')
      expect(await page.getByRole('region', { name: label, exact: true }).count()).toBe(0)
    } finally { await page.close() }
  })


  it.each(['settingsMetadata', 'settingsGroupMetadata', 'settingsImage', 'settingsRegion'])('preserves supporting content beside the split %s action', async (composition) => {
    const page = await mount('Fits', 'light', composition)
    try {
      const tree = await page.locator('#root').ariaSnapshot()
      expect(tree.split('Fits')).toHaveLength(2)
      for (const value of composition === 'settingsRegion' ? ['Additional information'] : composition === 'settingsImage' ? ['Special value'] : composition === 'settingsMetadata' ? ['Details', 'Value'] : ['Details']) {
        expect(tree.split(value)).toHaveLength(2)
      }
    } finally { await page.close() }
  })

  it('exposes a supporting region when its semantics change in place', async () => {
    const page = await mount('Fits', 'light', 'settingsEvolvingRegion')
    try {
      await page.getByRole('button', { name: 'Show details', exact: true }).click()
      await page.getByRole('region', { name: 'Additional information', exact: true }).waitFor({ timeout: 2_000 })
      expect((await page.locator('#root').ariaSnapshot()).split('Fits')).toHaveLength(2)
    } finally { await page.close() }
  })

  it.each(['settingsEvolvingLink', 'settingsEvolvingEditor'])('exposes supporting %s content when it becomes interactive in place', async (composition) => {
    const page = await mount('Fits', 'light', composition)
    try {
      await page.getByRole('button', { name: 'Show details', exact: true }).click()
      const content = composition === 'settingsEvolvingLink' ? page.getByRole('link', { name: 'Fits', exact: true }) : page.locator('[contenteditable="true"]:not([aria-hidden="true"])')
      await content.waitFor({ timeout: 2_000 })
      await content.focus()
      expect(await content.evaluate((element) => document.activeElement === element)).toBe(true)
      expect((await page.locator('#root').ariaSnapshot()).split('Fits')).toHaveLength(3)
    } finally { await page.close() }
  })

  it('keeps selected habit progress and state in the action name when its title overflows', async () => {
    const page = await mount(token, 'light', 'habit')
    try {
      const action = page.locator('[data-habit-row-body]')
      expect(await action.ariaSnapshot()).toContain('0 of 2')
      expect(await action.ariaSnapshot()).toContain('Overdue')
      const tree = await page.locator('[data-personal-text-action]').ariaSnapshot()
      expect(tree.split('0 of 2')).toHaveLength(2)
      expect(tree.split('Overdue')).toHaveLength(2)
      expect(await page.getByRole('region', { name: token, exact: true }).count()).toBe(1)
    } finally { await page.close() }
  })

  it.each(['radio', 'disabledRadio'])('keeps the split %s visual text out of the reading order', async (composition) => {
    const page = await mount('Fits', 'light', composition)
    try {
      const tree = await page.locator('#root').ariaSnapshot()
      expect(tree).not.toContain('- text:')
      expect(tree.split('Fits')).toHaveLength(composition === 'radio' ? 2 : 3)
    } finally { await page.close() }
  })

  it.each(['list', 'details', 'settings', 'settingsGroup', 'support'])('announces the split %s content once and preserves its expanded scroll region', async (composition) => {
    const page = await mount(token, 'light', composition)
    try {
      const collapsed = await page.locator('#root').ariaSnapshot()
      expect(collapsed.split(token)).toHaveLength(2)
      await page.getByRole('button').click()
      const region = page.getByRole('region', { name: token, exact: true })
      await region.waitFor()
      await region.focus()
      expect(await region.evaluate((element) => document.activeElement === element)).toBe(true)
      const expanded = await page.locator('#root').ariaSnapshot()
      expect(expanded.split(token)).toHaveLength(3)
      expect(expanded).not.toContain('- text:')
    } finally { await page.close() }
  })

  it('keeps disabled personal list content dimmed beside its disabled action', async () => {
    const page = await mount('Fits', 'light', 'disabledList')
    try {
      expect(await page.getByRole('button', { name: 'Fits' }).isDisabled()).toBe(true)
      expect(await page.locator('[data-personal-text-content]').evaluate((element) => getComputedStyle(element).opacity)).toBe('0.5')
    } finally { await page.close() }
  })

  it.each(['no-preference', 'reduce'] as const)('scales personal radio text and its action together with motion=%s', async (reducedMotion) => {
    const page = await mount('Fits')
    try {
      await page.emulateMedia({ reducedMotion })
      const radio = page.getByRole('radio', { name: 'Fits' })
      const text = page.locator('[data-personal-text]')
      const originalTextWidth = await text.evaluate((element) => element.getBoundingClientRect().width)
      const originalActionWidth = await radio.evaluate((element) => element.getBoundingClientRect().width)
      const point = await radio.evaluate((element) => { const bounds = element.getBoundingClientRect(); return { x: bounds.left + 5, y: bounds.top + 5 } })
      await page.mouse.move(point.x, point.y)
      await page.mouse.down()
      const scale = reducedMotion === 'reduce' ? 1 : 0.96
      await expect.poll(() => text.evaluate((element, width) => element.getBoundingClientRect().width / width, originalTextWidth)).toBeCloseTo(scale, 2)
      await expect.poll(() => radio.evaluate((element, width) => element.getBoundingClientRect().width / width, originalActionWidth)).toBeCloseTo(scale, 2)
      await page.mouse.up()
      await expect.poll(() => text.evaluate((element, width) => element.getBoundingClientRect().width / width, originalTextWidth)).toBeCloseTo(1, 2)
    } finally { await page.close() }
  })

  it.each(['Fits', 'Fits here'])('adds no text tab stop when expanded text fits: %s', async (label) => {
    const page = await mount(label)
    try {
      expect(await page.locator('[data-personal-text] [tabindex="0"], [data-personal-text][tabindex="0"]').count()).toBe(0)
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      expect(await page.getByRole('radio').evaluateAll((elements) => elements.some((element) => element === document.activeElement))).toBe(false)
    } finally { await page.close() }
  })
})
