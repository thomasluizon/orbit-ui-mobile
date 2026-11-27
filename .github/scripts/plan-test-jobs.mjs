#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const usage = `usage: plan-test-jobs.mjs --event <name> --turbo-dry <file> --workflow <file> [--changed-files <file>] [--deleted-files <file>]

  Prints the PR Tests plan as GITHUB_OUTPUT lines. Each test group gets a result cache key built from its
  Turbo task hashes (turbo run test test:cross-app build --dry=json) and the workflow file. The layout pass key follows the
  @orbit/web#build hash, the layout shard timings, the shard planner, the hermetic build check and the workflow file, so a
  layout shard that passed for the same app code needs no second run. A pull request also gets one flag per
  path scope (web, type-check, lint, tools), true when a changed path is an input of that scope. The tools scope
  holds every path except the unread documents that tool-tests-skip-paths.json lists, so a pull request that
  changes only those documents skips the tool tests.
  Every other event runs every scope. --changed-files is required for pull_request: one path per line.
  A pull request also gets unit-skip, true when it runs no unit test group: every changed path is under tools/ or .claude/ or is
  a document, no changed path is an input of a Turbo test task (the dry run lists them), and --deleted-files names no deleted
  path. A deleted file may have been an input, and an absent --deleted-files proves nothing, so either one keeps the groups.

exit codes: 0 plan printed, 1 missing Turbo task or unreadable input, 2 invalid arguments`

const workflowFile = /^\.github\/workflows\/test\.yml$/
const scopes = {
  web: [/^(apps\/web|packages\/shared)\//, /^(package|package-lock|turbo|tsconfig\.base)\.json$/, /^tools\/check-hermetic-web-build\.mjs$/, /^\.github\/(scripts\/plan-layout-shards\.mjs|layout-shard-timings\.json)$/],
  'type-check': [/^(apps|packages|eslint-rules)\/.+\.([cm]?[jt]sx?|json)$/, /(^|\/)tsconfig[^/]*\.json$/, /^(package|package-lock|turbo)\.json$/],
  lint: [/^(apps\/(web|mobile)|packages\/shared)\/.+\.[cm]?[jt]sx?$/, /^apps\/desktop\/(?!src-tauri\/).+\.[cm]?[jt]sx?$/],
}
// The paths that no app test group reads unless the Turbo dry run lists them as an input.
const appFree = [/^(tools|\.claude)\//, /\.md$/]
const testGroups = {
  'web-unit': ['@orbit/web#test'],
  'web-cross-app-unit': ['@orbit/web#test:cross-app'],
  'mobile-unit': ['@orbit/mobile#test'],
  'workspace-unit': ['@orbit/desktop#test', '@orbit/shared#test', '@orbit/eslint-rules#test'],
}

// A layout shard reads these files besides the app code that the @orbit/web#build hash covers.
const layoutTask = '@orbit/web#build'
const layoutInputs = ['../layout-shard-timings.json', 'plan-layout-shards.mjs', '../../tools/check-hermetic-web-build.mjs']

function digest(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 24)
}

let options
try {
  ({ values: options } = parseArgs({
    options: {
      event: { type: 'string' },
      'turbo-dry': { type: 'string' },
      workflow: { type: 'string' },
      'changed-files': { type: 'string' },
      'deleted-files': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  }))
} catch (error) {
  console.error(`${error.message}\n\n${usage}`)
  process.exit(2)
}
if (options.help) {
  console.log(usage)
  process.exit(0)
}
if (!options.event || !options['turbo-dry'] || !options.workflow ||
    (options.event === 'pull_request' && !options['changed-files'])) {
  console.error(usage)
  process.exit(2)
}

try {
  const dryTasks = JSON.parse(readFileSync(options['turbo-dry'], 'utf8')).tasks
  const hashes = new Map(dryTasks.map((task) => [task.taskId, task.hash]))
  const workflowDigest = digest(readFileSync(options.workflow, 'utf8'))
  const lines = Object.entries(testGroups).map(([group, tasks]) => {
    const missing = tasks.filter((task) => !hashes.has(task))
    if (missing.length) throw new Error(`the Turbo dry run has no ${missing.join(', ')}`)
    return `${group}-key=${group}-${digest(tasks.map((task) => `${task}=${hashes.get(task)}`).join('\n'))}-${workflowDigest}`
  })
  if (!hashes.has(layoutTask)) throw new Error(`the Turbo dry run has no ${layoutTask}`)
  const layoutFiles = layoutInputs.map((path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'))
  lines.push(`layout-key=layout-pass-${digest([`${layoutTask}=${hashes.get(layoutTask)}`, ...layoutFiles].join('\n'))}-${workflowDigest}`)
  const changed = options.event === 'pull_request'
    ? readFileSync(options['changed-files'], 'utf8').split('\n').filter(Boolean)
    : undefined
  for (const [scope, patterns] of Object.entries(scopes)) {
    const runs = !changed || changed.some((path) => workflowFile.test(path) || patterns.some((pattern) => pattern.test(path)))
    lines.push(`${scope}=${runs}`)
  }
  const taskInputs = new Set()
  let inputsKnown = true
  for (const task of dryTasks.filter((entry) => Object.values(testGroups).flat().includes(entry.taskId))) {
    if (typeof task.directory !== 'string' || task.inputs === null || typeof task.inputs !== 'object') inputsKnown = false
    else for (const input of Object.keys(task.inputs)) taskInputs.add(posix.normalize(posix.join(task.directory, input)))
  }
  const deleted = changed && options['deleted-files'] ?readFileSync(options['deleted-files'], 'utf8').split('\n').filter(Boolean) : null
  const unitSkip = Boolean(changed) && inputsKnown && deleted !== null && deleted.length === 0 &&
    changed.every((path) => !workflowFile.test(path) && appFree.some((pattern) => pattern.test(path)) && !taskInputs.has(path))
  lines.push(`unit-skip=${unitSkip}`)
  const skipPaths = new Set(JSON.parse(readFileSync(fileURLToPath(new URL('tool-tests-skip-paths.json', import.meta.url)), 'utf8')))
  lines.push(`tools=${!changed || changed.some((path) => !skipPaths.has(path))}`)
  console.log(lines.join('\n'))
} catch (error) {
  console.error(`plan-test-jobs: ${error.message}`)
  process.exit(1)
}
