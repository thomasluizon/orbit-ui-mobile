import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

export function renderSettingsRowMarkup(labels: readonly string[], habitName?: string): string {
  return execFileSync(process.execPath, ['--import', 'tsx', resolve('e2e/layout/render-settings-rows.tsx')], {
    input: JSON.stringify({ labels, habitName }),
    encoding: 'utf8',
    env: { ...process.env, TSX_TSCONFIG_PATH: resolve('e2e/layout/tsconfig.settings-rows.json') },
  })
}
