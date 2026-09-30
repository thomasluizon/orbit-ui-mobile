import { fireEvent, render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { PageHeader } from '@/components/ui/page-header'

describe('PageHeader', () => {
  describe('drawn title size', () => {
    let browserLaunch: BrowserLaunch | undefined
    let browser: Browser
    let stylesheet: string

    registerChromeLaunchHook(beforeAll, async (launch) => {
      browserLaunch = launch
      browser = await launch
    })
    beforeAll(async () => {
      const source = resolve(process.cwd(), 'app/globals.css')
      stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    })
    afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

    it.each([412, 1352])('matches Android at %ipx', async (width) => {
      const { container } = render(<PageHeader title="About" backLabel="Back to Profile" onBack={() => {}} />)
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        const title = page.getByRole('heading', { level: 1, name: 'About' })
        expect(await title.evaluate((element) => ({ size: getComputedStyle(element).fontSize, weight: getComputedStyle(element).fontWeight })))
          .toEqual({ size: '20px', weight: '500' })
      } finally {
        await page.close()
      }
    })
  })

  it('names the back control and exposes one start-aligned page heading', () => {
    const onBack = vi.fn()
    const view = render(<PageHeader title="About" backLabel="Back to Profile" onBack={onBack} />)
    const heading = screen.getByRole('heading', { level: 1, name: 'About' })
    expect(heading).toHaveClass('text-start')
    expect(view.container.querySelector('svg')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Profile' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })
})
