import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

const usage = `Usage: node tools/desktop-bench/acceptance-report.mjs --output <absolute-directory> [--step <name>=<outcome>]...
Write report.json for an installed acceptance job whose acceptance step wrote none, so the evidence upload always holds a report.
An existing report.json stays unchanged. A written report has passed false, the platform, the architecture, every step
outcome and an error that names the first step that ended failure or cancelled.
--output  The acceptance artifact directory, an absolute path. No stdin.
--step    One job step and its GitHub outcome: success, failure, cancelled, skipped or empty for a step that never
          started. Repeat it in step order.
--help, -h  Print usage. Exit 0: report.json exists; 2: invalid input.
`
// A step that never started, such as one after a failed checkout, has an empty outcome, which the report keeps as null.
const outcomes = new Set(['success', 'failure', 'cancelled', 'skipped', ''])

function parse(argumentsList) {
  let output = null
  const steps = []
  for (let index = 0; index < argumentsList.length; index += 2) {
    const [flag, value] = [argumentsList[index], argumentsList[index + 1]]
    if (value === undefined) return null
    if (flag === '--output' && output === null && isAbsolute(value)) output = value
    else if (flag === '--step' && /^[a-z]+=[a-z]*$/.test(value) && outcomes.has(value.split('=')[1])) {
      const [name, outcome] = value.split('=')
      steps.push({ name, outcome: outcome || null })
    } else return null
  }
  return output === null ? null : { output, steps }
}

function missingReport(steps, platform = process.platform, architecture = process.arch) {
  const failed = steps.find(({ outcome }) => outcome === 'failure' || outcome === 'cancelled')
  return { platform, architecture, passed: false, missingReport: true, steps: Object.fromEntries(steps.map(({ name, outcome }) => [name, outcome])),
    error: `Installed acceptance wrote no report.json; ${failed ? `step ${failed.name} ended ${failed.outcome}` : 'no recorded step failed'}; see the job log` }
}

const argumentsList = process.argv.slice(2)
if (argumentsList.includes('--help') || argumentsList.includes('-h')) {
  process.stdout.write(usage)
  process.exit(0)
}
const input = parse(argumentsList)
if (!input) {
  process.stderr.write(usage)
  process.exit(2)
}
const report = join(input.output, 'report.json')
if (!existsSync(report)) {
  mkdirSync(input.output, { recursive: true })
  writeFileSync(report, `${JSON.stringify(missingReport(input.steps), null, 2)}\n`)
}
