import { expect, type Page } from '@playwright/test'

export async function expectCompactFabNoticeGeometry(page: Page, closeLabel: string) {
  await expect(async () => {
    const fab = page.locator('[data-shell-fab]')
    const notice = page.locator('[data-shell-notice]')
    const composer = page.locator('[data-shell-pinned-slot]')
    await expect(fab).toBeVisible()
    await expect(composer).toBeVisible()

    const gapWithoutNotice = await page.evaluate(() => {
      document.querySelector('[data-layout-notice-probe]')?.remove()
      const fab = document.querySelector('[data-shell-fab]')
      const composer = document.querySelector('[data-shell-pinned-slot]')
      if (!fab || !composer) throw new Error('Compact shell controls missing')
      return composer.getBoundingClientRect().top - fab.getBoundingClientRect().bottom
    })
    expect(gapWithoutNotice).toBeGreaterThanOrEqual(15.5)

    const geometry = await notice.evaluate((slot, closeLabel) => {
      const panel = document.createElement('section')
      panel.setAttribute('data-celebration-panel', '')
      panel.setAttribute('data-layout-notice-probe', '')
      panel.style.cssText = 'height:92px;display:flex;align-items:center;justify-content:flex-end'
      const close = document.createElement('button')
      close.type = 'button'
      close.setAttribute('aria-label', closeLabel)
      close.style.cssText = 'width:48px;height:48px'
      close.addEventListener('click', () => { close.dataset.clicked = 'true' })
      panel.append(close)
      const host = slot.firstElementChild
      if (!host) throw new Error('Notice host missing')
      host.append(panel)
      const fab = document.querySelector('[data-shell-fab]')?.getBoundingClientRect()
      if (!fab) throw new Error('Compact FAB missing')
      const panelBox = panel.getBoundingClientRect()
      const closeBox = close.getBoundingClientRect()
      const hit = document.elementFromPoint(
        closeBox.left + closeBox.width / 2,
        closeBox.top + closeBox.height / 2,
      )
      const hitsClose = hit === close || close.contains(hit)
      if (hitsClose) close.click()
      return {
        gap: panelBox.top - fab.bottom,
        intersectsClose: fab.left < closeBox.right && closeBox.left < fab.right
          && fab.top < closeBox.bottom && closeBox.top < fab.bottom,
        hitsClose,
        clicked: close.dataset.clicked === 'true',
      }
    }, closeLabel)
    expect(geometry.gap).toBeGreaterThanOrEqual(15.5)
    expect(geometry.intersectsClose).toBe(false)
    expect(geometry.hitsClose).toBe(true)
    expect(geometry.clicked).toBe(true)
  }).toPass({ timeout: 15_000 })
}
