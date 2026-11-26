import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../../../..')
const doctor = path.join(repoRoot, '.github/react-doctor/node_modules/.bin/react-doctor')

const itWithDoctor = it.skipIf(!existsSync(doctor))

const PROJECTS = [
  {
    directory: 'apps/mobile',
    files: [
      'components/auth/turnstile-widget.tsx',
      'components/chat/pending-reply.tsx',
      'hooks/use-play-billing.ts',
      'lib/overlay-motion.ts',
    ],
  },
  { directory: 'apps/web', files: ['hooks/use-keyboard-shortcuts.ts', 'hooks/use-stripe-checkout-return.ts'] },
]

function effectCleanupFindings(directory: string, files: string[]) {
  const out = mkdtempSync(path.join(tmpdir(), 'orbit-doctor-'))
  const report = path.join(out, 'report.json')
  try {
    spawnSync(doctor, [...files, '--no-dead-code', '--no-supply-chain', '--no-score', '--yes', '--json', '--json-out', report], {
      cwd: path.join(repoRoot, directory),
      stdio: 'ignore',
    })
    const { diagnostics } = JSON.parse(readFileSync(report, 'utf8')) as { diagnostics: { rule: string; filePath: string; severity: string }[] }
    return diagnostics.filter((diagnostic) => diagnostic.rule === 'effect-needs-cleanup').map((diagnostic) => `${directory}/${diagnostic.filePath}`)
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}

itWithDoctor.each(PROJECTS)('React Doctor finds no effect timer without a cleanup it can see in $directory', ({ directory, files }) => {
  expect(effectCleanupFindings(directory, files)).toEqual([])
}, 120_000)
