import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { neutralColors } from '../../../packages/shared/src/theme/neutral-ramp.ts'
import { schemes } from '../../../packages/shared/src/theme/color-schemes.ts'

const LAUNCH_SIZE = 512

export function paintMascot(source: string, mode: 'dark' | 'light'): string {
  return source.replaceAll('var(--primary, currentColor)', schemes.orange.accent[mode].primary)
    .replaceAll('var(--orbit-surface, var(--bg, #09090B))', neutralColors[mode].bg)
    .replaceAll('var(--bg, #09090B)', neutralColors[mode].bg)
    .replaceAll('currentColor', neutralColors[mode].fg1)
}

export async function launchAsset(mode: 'dark' | 'light'): Promise<Buffer> {
  const source = await readFile(new URL('../../../design/brand/orbit-mascot.svg', import.meta.url), 'utf8')
  return sharp(Buffer.from(paintMascot(source, mode)), { density: (72 * LAUNCH_SIZE) / 420 })
    .resize(LAUNCH_SIZE, LAUNCH_SIZE, { fit: 'contain', background: neutralColors[mode].bg })
    .flatten({ background: neutralColors[mode].bg }).png().toBuffer()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const mode of ['dark', 'light'] as const) {
    await writeFile(new URL(`../src-tauri/native/launch-${mode}.png`, import.meta.url), await launchAsset(mode))
  }
}
