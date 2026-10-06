import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Menu } from '@/components/ui/menu'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const cases = (['dark', 'light'] as const).flatMap((mode) =>
  (['sheet', 'anchored'] as const).flatMap((presentation) =>
    (['reduce', 'no-preference'] as const).map((reducedMotion) => ({ mode, presentation, reducedMotion }))))

describe('Menu interaction colours in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it('underlines every word of a typed sheet title', async () => {
    const title = 'Ler um capítulo inteiro'
    render(<Menu open presentation="sheet" title={title} titleMode="typed" items={[{ id: 'edit', label: 'Edit', icon: 'pencil' }]} />)
    const dialog = await screen.findByRole('dialog', { name: title })
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${dialog.outerHTML}`)
      const words = await page.locator('.orbit-sheet-typed-title > span').evaluateAll((elements) =>
        elements.map((element) => ({ text: element.textContent, decoration: getComputedStyle(element).textDecorationLine })))
      expect(words.map((word) => word.text)).toEqual(title.split(' '))
      for (const word of words) expect(word.decoration, word.text).toBe('underline')
    } finally { await page.close() }
  })

  it.each(cases)('changes only the destructive fill in $mode $presentation with $reducedMotion motion', async ({ mode, presentation, reducedMotion }) => {
    const menuPresentation = presentation === 'sheet'
      ? { presentation: 'sheet' as const }
      : { presentation: 'anchored' as const, anchorRef: createRef<HTMLButtonElement>() }
    render(<Menu open {...menuPresentation} title="Habit actions" items={[
      { id: 'edit', label: 'Edit', icon: 'pencil' },
      { id: 'delete', label: 'Delete', icon: 'trash', destructive: true },
      { id: 'disabled', label: 'Unavailable', icon: 'trash', destructive: true, disabled: true },
    ]} />)
    const menu = await screen.findByRole('menu')
    const markup = presentation === 'sheet' ? screen.getByRole('dialog').outerHTML : menu.outerHTML
    const page = await browser.newPage({ viewport: { width: presentation === 'sheet' ? 412 : 1280, height: 915 } })
    try {
      await page.emulateMedia({ reducedMotion })
      const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([name, value]) => `${name}:${value}`).join(';')
      await page.setContent(`<style>${stylesheet} :root { ${theme} }</style>${markup}`)
      const remove = page.getByRole('menuitem', { name: 'Delete', exact: true })
      const measure = () => remove.evaluate((row) => {
        const style = getComputedStyle(row)
        const icon = row.querySelector('svg')!
        const label = row.querySelector('span:last-child')!
        const probe = document.createElement('span')
        probe.style.transition = 'none'
        row.append(probe)
        probe.style.color = 'var(--status-bad)'
        const dangerIcon = getComputedStyle(probe).color
        probe.style.color = 'var(--status-bad-text)'
        const dangerLabel = getComputedStyle(probe).color
        probe.style.backgroundColor = 'var(--bg-hover)'
        const hoverFill = getComputedStyle(probe).backgroundColor
        probe.remove()
        return { icon: getComputedStyle(icon).color, label: getComputedStyle(label).color,
          fill: style.backgroundColor, transform: style.transform, dangerIcon, dangerLabel, hoverFill }
      })
      for (const item of await page.getByRole('menuitem').all()) {
        expect((await item.boundingBox())!.height).toBe(presentation === 'sheet' ? 56 : 48)
      }
      const resting = await measure()
      expect(resting.icon).toBe(resting.dangerIcon)
      expect(resting.label).toBe(resting.dangerLabel)
      await remove.hover()
      await expect.poll(measure).toEqual({ ...resting, fill: resting.hoverFill })
      await page.mouse.down()
      await remove.evaluate((row) => Promise.all(row.getAnimations().map((animation) => animation.finished)))
      await expect.poll(measure).toEqual({ ...resting, fill: resting.hoverFill })
      await page.mouse.up()
      await page.mouse.move(0, 0)
      await expect.poll(measure).toEqual(resting)
      await remove.focus()
      await page.keyboard.down('Space')
      await remove.evaluate((row) => Promise.all(row.getAnimations().map((animation) => animation.finished)))
      await expect.poll(measure).toEqual({ ...resting, fill: resting.hoverFill })
      await page.keyboard.up('Space')
      await expect.poll(measure).toEqual(resting)
      const disabled = page.getByRole('menuitem', { name: 'Unavailable' })
      const disabledFill = await disabled.evaluate((row) => getComputedStyle(row).backgroundColor)
      await disabled.hover({ force: true })
      await expect.poll(() => disabled.evaluate((row) => getComputedStyle(row).backgroundColor)).toBe(disabledFill)
      const edit = page.getByRole('menuitem', { name: 'Edit', exact: true })
      await edit.hover()
      await expect.poll(() => edit.evaluate((row) => getComputedStyle(row).backgroundColor)).toBe(resting.hoverFill)
    } finally {
      await page.close()
    }
  })
})
