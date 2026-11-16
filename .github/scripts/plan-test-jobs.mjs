#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const usage = `usage: plan-test-jobs.mjs --event <name> --turbo-dry <file> --workflow <file> [--changed-files <file>]

  Prints the PR Tests plan as GITHUB_OUTPUT lines. Each test group gets a result cache key built from its
  Turbo task hashes (turbo run test --dry=json) and the workflow file. A pull request also gets one flag per
  path scope (web, type-check, lint), true when a changed path is an input of that scope.
  Every other event runs every scope. --changed-files is required for pull_request: one path per line.

exit codes: 0 plan printed, 1 missing Turbo task or unreadable input, 2 invalid arguments`

const workflowFile = /^\.github\/workflows\/test\.yml$/
const scopes = {
  web: [/^(apps\/web|packages\/shared)\//, /^(package|package-lock|turbo|tsconfig\.base)\.json$/, /^tools\/check-hermetic-web-build\.mjs$/],
  'type-check': [/^(apps|packages|eslint-rules)\/.+\.([cm]?[jt]sx?|json)$/, /(^|\/)tsconfig[^/]*\.json$/, /^(package|package-lock|turbo)\.json$/],
  lint: [/^(apps\/(web|mobile)|packages\/shared)\/.+\.[cm]?[jt]sx?$/, /^apps\/desktop\/(?!src-tauri\/).+\.[cm]?[jt]sx?$/],
}
const testGroups = {
  'web-unit': ['@orbit/web#test'],
  'mobile-unit': ['@orbit/mobile#test'],
  'workspace-unit': ['@orbit/desktop#test', '@orbit/shared#test', '@orbit/eslint-rules#test'],
}

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
  const hashes = new Map(JSON.parse(readFileSync(options['turbo-dry'], 'utf8')).tasks.map((task) => [task.taskId, task.hash]))
  const workflowDigest = digest(readFileSync(options.workflow, 'utf8'))
  const lines = Object.entries(testGroups).map(([group, tasks]) => {
    const missing = tasks.filter((task) => !hashes.has(task))
    if (missing.length) throw new Error(`the Turbo dry run has no ${missing.join(', ')}`)
    return `${group}-key=${group}-${digest(tasks.map((task) => `${task}=${hashes.get(task)}`).join('\n'))}-${workflowDigest}`
  })
  const changed = options.event === 'pull_request'
    ? readFileSync(options['changed-files'], 'utf8').split('\n').filter(Boolean)
    : undefined
  for (const [scope, patterns] of Object.entries(scopes)) {
    const runs = !changed || changed.some((path) => workflowFile.test(path) || patterns.some((pattern) => pattern.test(path)))
    lines.push(`${scope}=${runs}`)
  }
  console.log(lines.join('\n'))
} catch (error) {
  console.error(`plan-test-jobs: ${error.message}`)
  process.exit(1)
}
