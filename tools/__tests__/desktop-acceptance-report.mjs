import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { T, REPO_ROOT, check, root, stage } from './_harness.mjs'

// A job that fails before acceptance writes no report.json. The report tool then writes a failing report that names
// the first failed step, so the always-run upload names the step instead of failing on the missing file.
export function missingReportCases() {
  const tool = 'desktop-bench/acceptance-report.mjs'
  check(tool, 'missing report help is cwd safe', ['--help'], { status: 0, stdout: /Usage/ }, { cwd: root })
  check(tool, 'missing report rejects unknown flags before doing work', ['--unknown'], { status: 2 })
  check(tool, 'missing report rejects a relative output directory', ['--output', 'relative'], { status: 2 })
  check(tool, 'missing report rejects a step without an outcome', ['--output', join(root, 'report-invalid'), '--step', 'setup'], { status: 2 })
  check(tool, 'missing report rejects an outcome GitHub never reports', ['--output', join(root, 'report-invalid'), '--step', 'setup=red'], { status: 2 })
  T('missing report writes nothing for invalid input', !existsSync(join(root, 'report-invalid')))
  const written = join(root, 'report-missing')
  check(tool, 'missing report writes a report for a job whose producer checks failed', ['--output', written,
    '--step', 'setup=failure', '--step', 'nsis=skipped', '--step', 'acceptance=skipped'], { status: 0 })
  const report = JSON.parse(readFileSync(join(written, 'report.json'), 'utf8'))
  T('a missing report fails the job evidence and names the first failed step with every step outcome',
    report.passed === false && report.missingReport === true && report.platform === process.platform && report.architecture === process.arch &&
      JSON.stringify(report.steps) === '{"setup":"failure","nsis":"skipped","acceptance":"skipped"}' &&
      report.error === 'Installed acceptance wrote no report.json; step setup ended failure; see the job log', JSON.stringify(report))
  const crashed = join(root, 'report-crashed')
  check(tool, 'missing report names a skipped step only after the failed one', ['--output', crashed,
    '--step', 'setup=success', '--step', 'nsis=skipped', '--step', 'acceptance=failure'], { status: 0 })
  T('a skipped optional step is never named as the failure',
    JSON.parse(readFileSync(join(crashed, 'report.json'), 'utf8')).error === 'Installed acceptance wrote no report.json; step acceptance ended failure; see the job log')
  const unstarted = join(root, 'report-unstarted')
  check(tool, 'missing report accepts the empty outcome of a step that never started', ['--output', unstarted,
    '--step', 'setup=', '--step', 'acceptance='], { status: 0 })
  T('a step that never started stays in the report as null',
    JSON.stringify(JSON.parse(readFileSync(join(unstarted, 'report.json'), 'utf8')).steps) === '{"setup":null,"acceptance":null}')
  const kept = stage('report-kept/report.json', '{"passed":true}\n')
  check(tool, 'missing report keeps the report that acceptance wrote', ['--output', dirname(kept), '--step', 'acceptance=success'], { status: 0 })
  T('an acceptance report stays byte for byte', readFileSync(kept, 'utf8') === '{"passed":true}\n')
  const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/desktop-acceptance.yml'), 'utf8')
  const jobs = workflow.split('\n  installed-signed:\n')
  T('every acceptance job records a report before its always-run upload, from the outcome of each step that can fail first',
    jobs.length === 2 && jobs.every((job) => {
      const record = job.indexOf('- name: Record a report when acceptance wrote none\n        if: always()')
      const upload = job.indexOf('- name: Upload recording, native trees and report')
      return record > 0 && upload > record && job.includes('id: setup') && job.includes('id: acceptance') &&
        job.slice(record, upload).includes('node tools/desktop-bench/acceptance-report.mjs --output "$ACCEPTANCE_OUTPUT"') &&
        job.slice(record, upload).includes('--step "setup=$SETUP_OUTCOME"') && job.slice(record, upload).includes('--step "acceptance=$ACCEPTANCE_OUTCOME"')
    }) && jobs[0].includes('id: nsis') && jobs[0].slice(jobs[0].indexOf('- name: Record a report')).includes('--step "nsis=$NSIS_OUTCOME"'), workflow)
}
