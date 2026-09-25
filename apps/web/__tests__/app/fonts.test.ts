import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const { localFont } = vi.hoisted(() => ({
  localFont: vi.fn((options: { src: string; variable: string }) => ({
    variable: options.variable,
    className: 'local-font',
  })),
}))

vi.mock('next/font/local', () => ({ default: localFont }))

import { geist, geistMono, spaceGrotesk } from '@/app/fonts'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const fontModule = resolve(webRoot, 'app/fonts.ts')
const stylesheet = readFileSync(resolve(webRoot, 'app/globals.css'), 'utf8')

describe('local web fonts', () => {
  it('loads the three DESIGN.md families with their required weights and swap display', () => {
    expect(localFont).toHaveBeenCalledTimes(3)
    expect(localFont.mock.calls.map(([options]) => options)).toEqual([
      {
        src: '../fonts/geist-latin.woff2',
        weight: '400 600',
        style: 'normal',
        variable: '--font-geist',
        display: 'swap',
      },
      {
        src: '../fonts/space-grotesk-latin.woff2',
        weight: '500 600',
        style: 'normal',
        variable: '--font-space-grotesk',
        display: 'swap',
      },
      {
        src: '../fonts/geist-mono-latin.woff2',
        weight: '400 500',
        style: 'normal',
        variable: '--font-geist-mono',
        display: 'swap',
      },
    ])
    expect([geist.variable, spaceGrotesk.variable, geistMono.variable]).toEqual([
      '--font-geist',
      '--font-space-grotesk',
      '--font-geist-mono',
    ])
  })

  it('resolves every font source to a committed file under apps/web/fonts', () => {
    const fontDirectory = resolve(webRoot, 'fonts')
    for (const [options] of localFont.mock.calls) {
      const source = resolve(dirname(fontModule), options.src)
      expect(source.startsWith(`${fontDirectory}/`)).toBe(true)
      expect(existsSync(source)).toBe(true)
    }
  })

  it('provides every font variable consumed by app/globals.css', () => {
    for (const [options] of localFont.mock.calls) {
      expect(stylesheet).toContain(`var(${options.variable})`)
    }
  })
})
