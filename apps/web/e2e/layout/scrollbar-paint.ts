import type { Locator } from '@playwright/test'
import sharp from 'sharp'

export async function measureScrollbarPaint(scroller: Locator, axis: 'vertical' | 'horizontal' = 'vertical') {
  const { clip, background, thumb } = await scroller.evaluate((element, axis) => {
    if (window.visualViewport && window.visualViewport.scale !== 1) {
      throw new Error(`measureScrollbarPaint needs visual viewport scale 1, got ${window.visualViewport.scale}`)
    }
    const bounds = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')!
    context.fillStyle = style.getPropertyValue('--bg').trim()
    context.fillRect(0, 0, 1, 1)
    const background = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
    context.fillStyle = style.getPropertyValue('--hairline').trim()
    context.fillRect(0, 0, 1, 1)
    const thumb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
    const right = bounds.right - parseFloat(style.borderRightWidth)
    const bottom = bounds.bottom - parseFloat(style.borderBottomWidth)
    const left = bounds.left + parseFloat(style.borderLeftWidth)
    const top = bounds.top + parseFloat(style.borderTopWidth)
    return {
      clip: axis === 'vertical'
        ? { x: right - 8, y: top, width: 8, height: bottom - top }
        : { x: left, y: bottom - 8, width: right - left, height: 8 },
      background,
      thumb,
    }
  }, axis)
  const pixels = await sharp(await scroller.page().screenshot({ clip, scale: 'css' })).removeAlpha().raw().toBuffer()
  let backgroundPixels = 0
  let thumbPixels = 0
  for (let offset = 0; offset < pixels.length; offset += 3) {
    if (background.every((channel, index) => pixels[offset + index] === channel)) backgroundPixels++
    if (thumb.every((channel, index) => pixels[offset + index] === channel)) thumbPixels++
  }
  return { backgroundPixels, thumbPixels, totalPixels: pixels.length / 3 }
}
