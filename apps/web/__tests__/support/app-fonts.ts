import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'

const faces = [
  { family: 'Geist', variable: '--font-geist', file: 'geist-latin.woff2', weight: '400 600' },
  { family: 'Space Grotesk', variable: '--font-space-grotesk', file: 'space-grotesk-latin.woff2', weight: '500 600' },
  { family: 'Geist Mono', variable: '--font-geist-mono', file: 'geist-mono-latin.woff2', weight: '400 500' },
]

const stylesheet = faces.map(({ family, variable, file, weight }) => {
  const font = readFileSync(resolve(process.cwd(), 'fonts', file)).toString('base64')
  return `@font-face { font-family: '${family}'; font-style: normal; font-weight: ${weight}; src: url(data:font/woff2;base64,${font}) format('woff2'); }
    :root { ${variable}: '${family}'; }`
}).join('\n') + `
  :root {
    --font-sans: var(--font-geist), sans-serif;
    --font-display: var(--font-space-grotesk), sans-serif;
    --font-mono: var(--font-geist-mono), monospace;
  }
  body { font-family: var(--font-sans); }
`

export async function loadAppFonts(page: Page): Promise<void> {
  await page.addStyleTag({ content: stylesheet })
  await page.evaluate(async () => {
    await Promise.all(['Geist', 'Space Grotesk', 'Geist Mono'].map((family) => document.fonts.load(`500 16px "${family}"`)))
    await document.fonts.ready
  })
}
