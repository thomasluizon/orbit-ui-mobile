import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sheet } from '@/components/ui/sheet'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function ParentPickerHost({ virtualizedBody }: Readonly<{ virtualizedBody?: boolean }>) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('Root')
  return <Sheet title="Editor" virtualizedBody={virtualizedBody} actions={<button type="button">Save</button>}>
    <input aria-label="Title" />
    <button type="button" aria-label="Parent" onClick={() => setOpen(true)}>{value}</button>
    {open ? <Sheet title="Parent picker" onClose={() => setOpen(false)}><button type="button" onClick={() => setValue('A complete destination name with enough words to fill several lines')}>Choose long parent</button></Sheet> : null}
  </Sheet>
}

async function mountMeasuredSheet(virtualizedBody = false) {
  const observers: MeasuredResizeObserver[] = []
  class MeasuredResizeObserver {
    private readonly targets = new Set<Element>()
    constructor(private readonly callback: ResizeObserverCallback) { observers.push(this) }
    observe(target: Element) { this.targets.add(target) }
    unobserve(target: Element) { this.targets.delete(target) }
    disconnect() { this.targets.clear() }
    resize(target: Element) { if (this.targets.has(target)) this.callback([], this) }
  }
  vi.stubGlobal('ResizeObserver', MeasuredResizeObserver)
  const view = render(<ParentPickerHost virtualizedBody={virtualizedBody} />)
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus())
  const control = screen.getByRole('button', { name: 'Parent' })
  const body = control.closest<HTMLDivElement>('[data-slot="sheet-body"]')!
  const footer = screen.getByRole('button', { name: 'Save' }).closest('footer')!
  let controlTop = 380
  let controlHeight = 120
  let bodyHeight = 300
  Object.defineProperties(body, { clientHeight: { get: () => bodyHeight }, clientTop: { value: 0 } })
  vi.spyOn(body, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 194, 560, bodyHeight))
  vi.spyOn(footer, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 194 + bodyHeight, 560, 76))
  vi.spyOn(control, 'getBoundingClientRect').mockImplementation(() => new DOMRect(24, controlTop - body.scrollTop, 512, controlHeight))
  vi.spyOn(screen.getByRole('textbox', { name: 'Title' }), 'getBoundingClientRect').mockImplementation(() => new DOMRect(24, 218 - body.scrollTop, 512, 48))
  return {
    body, control, footer,
    resize: (target = control) => act(() => observers.forEach((observer) => observer.resize(target))),
    setControlBounds: (top: number, height: number) => { controlTop = top; controlHeight = height },
    setBodyHeight: (height: number) => { bodyHeight = height },
    setVirtualizedBody: (value: boolean) => act(() => view.rerender(<ParentPickerHost virtualizedBody={value} />)),
  }
}

describe('Sheet focused control visibility', () => {
  it('reveals the complete grown control when the picker restores focus without native scrolling', async () => {
    const user = userEvent.setup()
    const { control, body, footer, resize, setControlBounds } = await mountMeasuredSheet()
    setControlBounds(380, 48)
    await user.click(control)
    await user.click(screen.getByRole('button', { name: 'Choose long parent' }))
    setControlBounds(380, 120)
    resize()
    expect(body.scrollTop).toBe(0)
    await user.click(screen.getByRole('button', { name: 'common.close' }))
    expect(control).toHaveFocus()
    expect(control.getBoundingClientRect().bottom).toBeLessThanOrEqual(footer.getBoundingClientRect().top)
    expect(control.getBoundingClientRect().top).toBeGreaterThanOrEqual(body.getBoundingClientRect().top)
  })

  it('keeps a focused control clear when its text grows or the body shrinks', async () => {
    const { control, body, footer, resize, setControlBounds, setBodyHeight } = await mountMeasuredSheet()
    setControlBounds(380, 48)
    act(() => control.focus())
    expect(body.scrollTop).toBe(0)
    setControlBounds(380, 160)
    resize()
    expect(control.getBoundingClientRect().bottom).toBeLessThanOrEqual(footer.getBoundingClientRect().top)
    setBodyHeight(240)
    resize(body)
    expect(control.getBoundingClientRect().bottom).toBeLessThanOrEqual(footer.getBoundingClientRect().top)
  })

  it('restores controls above the body without moving controls already in view', async () => {
    const { control, body, setControlBounds, resize } = await mountMeasuredSheet()
    setControlBounds(260, 48)
    body.scrollTop = 100
    act(() => control.focus())
    expect(control.getBoundingClientRect().top).toBeGreaterThanOrEqual(body.getBoundingClientRect().top)
    const visibleScroll = body.scrollTop
    resize()
    expect(body.scrollTop).toBe(visibleScroll)
  })

  it('leaves the underlying scroll position alone while the footer owns focus', async () => {
    const { control, body, resize, setControlBounds } = await mountMeasuredSheet()
    setControlBounds(380, 48)
    act(() => control.focus())
    body.scrollTop = 100
    act(() => screen.getByRole('button', { name: 'Save' }).focus())
    setControlBounds(380, 160)
    resize()
    expect(body.scrollTop).toBe(100)
  })

  it('lets the virtualized body keep ownership of its own scrolling', async () => {
    const { body, control, resize } = await mountMeasuredSheet(true)
    act(() => control.focus({ preventScroll: true }))
    resize(body)
    expect(body.scrollTop).toBe(0)
  })

  it('releases scrolling when a date picker switches to a virtualized year list', async () => {
    const { body, control, resize, setControlBounds, setVirtualizedBody } = await mountMeasuredSheet()
    setControlBounds(380, 48)
    act(() => control.focus())
    setVirtualizedBody(true)
    setControlBounds(380, 160)
    resize()
    expect(body.scrollTop).toBe(0)
  })
})
