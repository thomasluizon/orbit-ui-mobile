import { expect, type Locator } from '@playwright/test'

export async function expectDayCircle(slot: Locator, status = true, todayRing = false, target = false) {
  await expect(async () => {
    const geometry = await slot.evaluate((slot) => {
      const bounds = slot.getBoundingClientRect()
      const probe = document.createElement('span')
      probe.style.color = 'var(--primary)'
      document.body.append(probe)
      const primary = getComputedStyle(probe).color
      probe.remove()
      const boxes = [slot, ...slot.querySelectorAll<HTMLElement>('*')].flatMap((element) => {
        const bounds = element.getBoundingClientRect()
        return [null, '::before', '::after'].flatMap((pseudo) => {
          const style = getComputedStyle(element, pseudo)
          if (pseudo && (style.content === 'none' || style.content === 'normal')) return []
          const background = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent'
          const border = ['Top', 'Right', 'Bottom', 'Left'].some((edge) => Number.parseFloat(style.getPropertyValue(`border-${edge.toLowerCase()}-width`)) > 0)
          if (!background && style.boxShadow === 'none' && !border && style.outlineStyle === 'none') return []
          const width = pseudo ? Number.parseFloat(style.width) : bounds.width
          const height = pseudo ? Number.parseFloat(style.height) : bounds.height
          const left = pseudo ? bounds.left + Number.parseFloat(style.left) : bounds.left
          const top = pseudo ? bounds.top + Number.parseFloat(style.top) : bounds.top
          return [{ width, height, radius: Number.parseFloat(style.borderRadius), centerX: left + width / 2, centerY: top + height / 2,
            primaryRing: (style.boxShadow.includes(primary) && style.boxShadow.includes('2px')) || (style.outlineColor === primary && style.outlineWidth === '2px'),
            ring: style.boxShadow, background: style.backgroundColor }]
        })
      })
      const disc = slot.querySelector('[data-day-disc]')?.getBoundingClientRect()
      const button = slot.querySelector('button')
      return { boxes, centerX: bounds.left + bounds.width / 2, centerY: bounds.top + bounds.height / 2,
        slotWidth: bounds.width, disc: disc && { width: disc.width, height: disc.height, centerX: disc.left + disc.width / 2, centerY: disc.top + disc.height / 2 },
        target: button && { width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height },
        hits: button && [bounds.left + 2, bounds.right - 2].map((x) => button.contains(document.elementFromPoint(x, bounds.top + bounds.height / 2))) }
    })
    expect(geometry.boxes.length).toBeGreaterThan(0)
    for (const box of geometry.boxes) {
      expect(Math.abs(box.width - box.height), JSON.stringify(box)).toBeLessThanOrEqual(0.5)
      expect(box.width).toBeLessThanOrEqual(44.5)
      expect(box.radius).toBeGreaterThanOrEqual(box.width / 2)
      expect(Math.abs(box.centerX - geometry.centerX)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(box.centerY - geometry.centerY)).toBeLessThanOrEqual(0.5)
    }
    if (status) {
      expect(geometry.disc).toBeDefined()
      expect(geometry.disc!.width).toBeCloseTo(34, 1)
      expect(geometry.disc!.height).toBeCloseTo(34, 1)
      expect(Math.abs(geometry.disc!.centerX - geometry.centerX)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(geometry.disc!.centerY - geometry.centerY)).toBeLessThanOrEqual(0.5)
    }
    if (todayRing) expect(geometry.boxes.filter((box) => box.primaryRing)).toHaveLength(1)
    if (target) {
      expect(geometry.target!.width).toBeCloseTo(geometry.slotWidth, 1)
      expect(geometry.target!.height).toBeGreaterThanOrEqual(44)
      expect(geometry.hits).toEqual([true, true])
    }
  }).toPass()
}

export async function expectDayCircleHover(button: Locator) {
  const slot = button.locator('..')
  await button.hover()
  if (await button.getAttribute('aria-pressed') === 'true') {
    const circle = button.locator('[data-day-circle]')
    await expect.poll(() => circle.locator(':scope > [data-press-fill]').evaluate((element) => getComputedStyle(element).opacity)).toBe('0')
    expect(await circle.evaluate((element) => {
      const probe = document.createElement('span')
      probe.style.backgroundColor = 'var(--selection-bg)'
      element.append(probe)
      const selected = getComputedStyle(probe).backgroundColor
      probe.remove()
      return getComputedStyle(element).backgroundColor === selected
    })).toBe(true)
    await expectDayCircle(slot, true, true, true)
    return
  }
  const fill = button.locator('[data-day-circle] > [data-press-fill]')
  await expect.poll(() => fill.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')
  await expect(async () => {
    const geometry = await fill.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const slot = element.closest('[data-calendar-date]')!.getBoundingClientRect()
      const probe = document.createElement('span')
      probe.style.backgroundColor = 'var(--bg-hover)'
      element.append(probe)
      const hover = getComputedStyle(probe).backgroundColor
      probe.remove()
      return { width: bounds.width, height: bounds.height, diameter: Math.min(44, slot.width), background: getComputedStyle(element).backgroundColor, hover }
    })
    expect(geometry.width).toBeCloseTo(geometry.diameter, 1)
    expect(geometry.height).toBeCloseTo(geometry.diameter, 1)
    expect(geometry.background).toBe(geometry.hover)
  }).toPass()
  await expectDayCircle(slot, true, false, true)
}
