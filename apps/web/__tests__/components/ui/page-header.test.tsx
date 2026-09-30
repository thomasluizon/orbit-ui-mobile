import { fireEvent, render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { PageHeader } from '@/components/ui/page-header'
import { CalendarHeader } from '@/app/(app)/calendar/_components/calendar-shell'
import { LegalDocumentLayout } from '@/components/legal-document-layout'
import { Markdown } from '@/components/ui/markdown'

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

    it.each([412, 1352])('renders the calendar and legal hierarchy at %ipx', async (width) => {
      const noop = () => {}
      const { container } = render(<>
        <CalendarHeader monthLabel="April" year={2026} previousMonthLabel="Previous" nextMonthLabel="Next"
          currentMonthLabel="Current month" selectYearLabel="Select year" onPreviousMonth={noop}
          onNextMonth={noop} onCurrentMonth={noop} onSelectYear={noop} />
        <LegalDocumentLayout title="Privacy" lastUpdated="Updated" backLabel="Back" onBack={noop}
          sections={[{ id: 'privacy', title: 'Your privacy', paragraphs: ['Your privacy matters.'] }]}
          closingNote={{ id: 'contact', title: 'Contact', paragraphs: ['Contact us.'] }} />
      </>)
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        const fontSize = (element: Element) => getComputedStyle(element).fontSize
        expect(await page.getByText('April', { exact: true }).evaluate(fontSize)).toBe('28px')
        expect(await page.getByRole('button', { name: 'Select year' }).evaluate(fontSize)).toBe(width >= 1024 ? '14px' : '12px')
        expect(await page.locator('[data-legal-document-content] header p').first().evaluate(fontSize)).toBe(width < 640 ? '22px' : '28px')
        expect(await page.getByRole('heading', { level: 2, name: 'Your privacy' }).evaluate(fontSize)).toBe('17px')
        expect(await page.getByText('Your privacy matters.', { exact: true }).evaluate(fontSize)).toBe('16px')
      } finally {
        await page.close()
      }
    })

    it.each([320, 412, 1352])('preserves the Markdown heading hierarchy at %ipx', async (width) => {
      const { container } = render(<Markdown content={'# Heading one\n\n## Heading two\n\n### Heading three\n\nBody text.'} />)
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        for (const [level, size] of [[1, '28px'], [2, '22px'], [3, '17px']] as const) {
          const heading = page.getByRole('heading', { level })
          expect(await heading.evaluate((element) => getComputedStyle(element).fontSize)).toBe(size)
        }
        expect(await page.getByText('Body text.', { exact: true }).evaluate((element) => getComputedStyle(element).fontSize)).toBe('14px')
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
