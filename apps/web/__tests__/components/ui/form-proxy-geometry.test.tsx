import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { render, screen } from '@testing-library/react'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { Checkbox } from '@/components/ui/checkbox'
import { CheckRow } from '@/components/ui/check-row'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioItem } from '@/components/ui/radio-group'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

let browserLaunch: BrowserLaunch | undefined
let browser: Browser
let stylesheet: string
registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
beforeAll(async () => {
  const source = resolve(process.cwd(), 'app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
})
afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

it('keeps form proxy inputs out of field and interaction inventories while retaining labelled controls', async () => {
  const { container } = render(<form>
    <Input label="Message" value="Help" onChange={vi.fn()} />
    <Checkbox label="Consent" checked onChange={vi.fn()} />
    <CheckRow label="Remind me" checked onChange={vi.fn()} />
    <Switch label="Notifications" checked onChange={vi.fn()} />
    <RadioGroup aria-label="Schedule"><RadioItem selected onSelect={vi.fn()}><button>Daily</button></RadioItem></RadioGroup>
    <SegmentedControl label="Views" value="today" options={[{ value: 'today', label: 'Today' }, { value: 'all', label: 'All' }]} onChange={vi.fn()} />
    <Select label="Category" value="habit" options={[{ value: 'habit', label: 'Habit' }]} onChange={vi.fn()} />
  </form>)
  for (const [role, name] of [['textbox', 'Message'], ['checkbox', 'Consent'], ['checkbox', 'Remind me'], ['switch', 'Notifications'], ['radio', 'Daily'], ['combobox', 'Category']]) {
    expect(screen.getByRole(role!, { name })).toHaveAccessibleName(name)
  }
  expect(container.querySelectorAll('input[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3)
  const page = await browser.newPage()
  try {
    await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
    const inventory = await page.evaluate(() => ({
      fields: [...document.querySelectorAll('input, textarea')].filter((field) => field.getClientRects().length > 0).map((field) => field.getAttribute('aria-label') ?? [...(field as HTMLInputElement).labels ?? []].map((label) => label.textContent).join(' ')),
      proxies: [...document.querySelectorAll('input[aria-hidden="true"], select[aria-hidden="true"]')].map((proxy) => proxy.getClientRects().length),
    }))
    expect(inventory.fields).toEqual(['Message'])
    expect(inventory.proxies.length).toBeGreaterThanOrEqual(4)
    expect(inventory.proxies.every((rectangles) => rectangles === 0)).toBe(true)
  } finally { await page.close() }
})
