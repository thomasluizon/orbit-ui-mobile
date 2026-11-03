import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { neutralColors } from '../../../packages/shared/src/theme/neutral-ramp.ts'
import { schemes } from '../../../packages/shared/src/theme/color-schemes.ts'

export async function launchAsset(mode: 'dark' | 'light'): Promise<Buffer> {
  const source = await readFile(new URL('../../../design/brand/orbit-mark-accent.svg', import.meta.url), 'utf8')
  const painted = source.replaceAll('var(--primary, currentColor)', schemes.orange.accent[mode].primary)
    .replaceAll('currentColor', neutralColors[mode].fg1)
  const mark = await sharp(Buffer.from(painted)).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({ width: 205 }).png().toBuffer()
  return sharp({ create: { width: 512, height: 512, channels: 4, background: neutralColors[mode].bg } })
    .composite([{ input: mark, gravity: 'centre' }]).png().toBuffer()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const mode of ['dark', 'light'] as const) {
    await writeFile(new URL(`../src-tauri/native/launch-${mode}.png`, import.meta.url), await launchAsset(mode))
  }
}
