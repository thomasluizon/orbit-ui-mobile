import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import windows from '../src-tauri/tauri.windows.conf.json'

const iconPath = new URL('../src-tauri/icons/icon.ico', import.meta.url)
const tileMargins: Record<number, number> = { 16: 1, 24: 1, 32: 2, 48: 4, 64: 6, 256: 24 }
const expectedSizes = Object.keys(tileMargins).map(Number)
const maxCornerAlpha = 32
const tileColour = [9, 9, 11, 255]

interface IconEntry {
  size: number
  png: Buffer
}

// ICONDIR is 6 bytes and each ICONDIRENTRY is 16 bytes. A width of 0 means 256.
function readIconEntries(file: Buffer): IconEntry[] {
  return Array.from({ length: file.readUInt16LE(4) }, (_, index) => {
    const entryOffset = 6 + index * 16
    const size = file.readUInt8(entryOffset) || 256
    const length = file.readUInt32LE(entryOffset + 8)
    const dataOffset = file.readUInt32LE(entryOffset + 12)
    return { size, png: file.subarray(dataOffset, dataOffset + length) }
  })
}

async function decode({ png }: IconEntry) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const pixelAt = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4))
  return { width: info.width, height: info.height, pixelAt }
}

describe('Windows icon.ico', () => {
  const entries = readIconEntries(readFileSync(iconPath))

  it('carries one PNG entry for each Windows icon size', () => {
    expect(entries.map(({ size }) => size)).toEqual(expectedSizes)
  })

  it.each(expectedSizes)('draws the %ipx entry as an inset, rounded tile', async (size) => {
    const entry = entries.find((candidate) => candidate.size === size)!
    const { width, height, pixelAt } = await decode(entry)
    expect([width, height]).toEqual([size, size])

    const last = size - 1
    // A full-bleed square is opaque on the whole outer ring. The inset tile leaves it transparent.
    for (let offset = 0; offset < size; offset += 1) {
      expect(pixelAt(offset, 0)[3], `top edge x=${offset}`).toBe(0)
      expect(pixelAt(offset, last)[3], `bottom edge x=${offset}`).toBe(0)
      expect(pixelAt(0, offset)[3], `left edge y=${offset}`).toBe(0)
      expect(pixelAt(last, offset)[3], `right edge y=${offset}`).toBe(0)
    }

    // The first pixel inside the margin is the tile corner. Rounding leaves it almost transparent,
    // within anti-aliasing noise, while the middle of the tile is the unchanged near-black colour.
    const corner = tileMargins[size]!
    expect(pixelAt(corner, corner)[3], 'tile corner').toBeLessThan(maxCornerAlpha)
    expect(pixelAt(last - corner, corner)[3], 'tile corner').toBeLessThan(maxCornerAlpha)
    expect(pixelAt(corner, last - corner)[3], 'tile corner').toBeLessThan(maxCornerAlpha)
    expect(pixelAt(last - corner, last - corner)[3], 'tile corner').toBeLessThan(maxCornerAlpha)
    expect(pixelAt(Math.floor(size / 2), corner + 1)).toEqual(tileColour)
  })

  it('keeps the accent moon on the 256px entry', async () => {
    const { pixelAt, width } = await decode(entries.find(({ size }) => size === 256)!)
    let accent = 0
    for (let y = 0; y < width; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const [red, green, blue, alpha] = pixelAt(x, y)
        if (alpha >= 128 && red > green * 2 && green > blue * 2) accent += 1
      }
    }
    expect(accent).toBeGreaterThan(0)
  })

  it('gives the NSIS installer and uninstaller the same icon', () => {
    expect(windows.bundle.windows.nsis).toEqual({ installerIcon: 'icons/icon.ico', uninstallerIcon: 'icons/icon.ico' })
  })
})
