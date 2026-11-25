import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { bundleGeometry } from '@/__tests__/support/profile-settings-browser'

const entry = `
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { NextIntlClientProvider } from 'next-intl';
  import en from '../../packages/shared/src/i18n/en.json';
  import { ConfirmSheet } from './components/ui/confirm-sheet';
  const root = document.getElementById('root');
  const question = root.dataset.question === 'true';
  const noop = () => {};
  createRoot(root).render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <ConfirmSheet open quickOptions={question} title='Quer registrar "Organization" como concluído?' message="" confirmLabel="Registrar hábito" cancelLabel="Agora não" onCancel={noop} onConfirm={noop} />
  </NextIntlClientProvider>);
`

describe('a question dialog draws its answers at the size of the plain confirm dialog', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let script: string
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    script = bundleGeometry(entry, {
      'next/navigation': "export const useRouter = () => ({push: () => {}}); export const usePathname = () => '/';",
    })
  }, 60_000)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([{ width: 1440, height: 900 }, { width: 390, height: 844 }])('is no taller than the plain dialog at $width by $height, with the positive answer at the end edge', async ({ width, height }) => {
    const measure = async (question: boolean) => {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' })
      try {
        await page.setContent(`<style>${stylesheet}</style><div id="root" data-question="${question}"></div>`)
        await page.addScriptTag({ content: script })
        const dialog = page.getByRole('dialog')
        await dialog.waitFor()
        const box = (await dialog.boundingBox())!
        const buttons = await dialog.getByRole('button', { name: /Registrar hábito|Agora não/ }).evaluateAll((nodes) => nodes.map((node) => {
          const rect = node.getBoundingClientRect()
          return { label: node.textContent, left: rect.left, height: rect.height, size: node.getAttribute('data-size'), card: node.hasAttribute('data-option-card') }
        }))
        return { height: box.height, buttons }
      } finally { await page.close() }
    }
    const plain = await measure(false)
    const asked = await measure(true)
    expect(Math.abs(asked.height - plain.height)).toBeLessThanOrEqual(4)
    expect(asked.buttons.map((button) => button.card)).toEqual([false, false])
    expect(asked.buttons.map((button) => [button.size, button.height])).toEqual(plain.buttons.map((button) => [button.size, button.height]))
    expect(asked.buttons.map((button) => button.label)).toEqual(['Agora não', 'Registrar hábito'])
    expect(asked.buttons[1]!.left).toBeGreaterThan(asked.buttons[0]!.left)
  }, 60_000)
})
