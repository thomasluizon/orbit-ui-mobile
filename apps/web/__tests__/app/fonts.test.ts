import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const { localFont } = vi.hoisted(() => ({
  localFont: vi.fn((options: { src: { path: string; weight: string; style: string }[]; variable: string }) => ({
    variable: options.variable,
    className: 'local-font',
  })),
}))

vi.mock('next/font/local', () => ({ default: localFont }))

import { rubik, inter, roboto } from '@/app/fonts'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const fontModule = resolve(webRoot, 'app/fonts.ts')
const stylesheet = readFileSync(resolve(webRoot, 'app/globals.css'), 'utf8')

describe('local web fonts', () => {
  it('loads the three DESIGN.md families with their exact weights and swap display', () => {
    expect(localFont).toHaveBeenCalledTimes(3)
    expect(localFont.mock.calls.map(([options]) => options)).toEqual([
      {
        src: ['400', '500', '600', '700'].map((weight) => ({
          path: '../fonts/rubik-latin.woff2', weight, style: 'normal',
        })),
        variable: '--font-rubik',
        display: 'swap',
      },
      {
        src: ['500', '600', '700'].map((weight) => ({
          path: '../fonts/inter-latin.woff2', weight, style: 'normal',
        })),
        variable: '--font-inter',
        display: 'swap',
      },
      {
        src: ['400', '500', '700'].map((weight) => ({
          path: '../fonts/roboto-latin.woff2', weight, style: 'normal',
        })),
        variable: '--font-roboto',
        display: 'swap',
      },
    ])
    expect([rubik.variable, inter.variable, roboto.variable]).toEqual([
      '--font-rubik', '--font-inter', '--font-roboto',
    ])
  })

  it('resolves every font source to a committed file under apps/web/fonts', () => {
    const fontDirectory = resolve(webRoot, 'fonts')
    for (const [options] of localFont.mock.calls) {
      for (const sourceFile of options.src) {
        const source = resolve(dirname(fontModule), sourceFile.path)
        expect(dirname(source)).toBe(fontDirectory)
        expect(existsSync(source)).toBe(true)
      }
    }
  })

  it('provides every font variable consumed by app/globals.css', () => {
    for (const [options] of localFont.mock.calls) {
      expect(stylesheet).toContain(`var(${options.variable})`)
    }
  })
})
