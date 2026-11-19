#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const usage = `usage: merged-unit-results.mjs record
       merged-unit-results.mjs find --repository <owner/name> --sha <commit>
       merged-unit-results.mjs match --keys-file <file>

  A push to main reuses the unit test results of the pull request that it merged, when the result keys are equal.

  record  Prints the unit result keys of this run as JSON, read from WEB_UNIT_KEY, MOBILE_UNIT_KEY and
          WORKSPACE_UNIT_KEY. The Unit Tests job of a pull request stores it in its unit-test-coverage artifact.
  find    Prints artifact-id=<id>, run-id=<id> and pull=<number> as GITHUB_OUTPUT lines: the unit-test-coverage
          artifact of the newest successful pull_request run of .github/workflows/test.yml at the head of the pull
          request whose merge commit is <commit>. Reads the GitHub REST API with GITHUB_TOKEN. Prints no line and a
          notice when no such artifact exists, and no line and a warning when an API call fails: the run then
          executes its unit tests.
  match   Prints <group>=true or <group>=false for each unit test group: true when the keys file holds the key that
          this run computed. Prints false for every group when the keys file is absent.

exit codes: 0 done, 1 an unreadable keys file or a missing key variable, 2 invalid arguments`

const groups = { 'web-unit': 'WEB_UNIT_KEY', 'mobile-unit': 'MOBILE_UNIT_KEY', 'workspace-unit': 'WORKSPACE_UNIT_KEY' }
const workflowPath = '.github/workflows/test.yml'
const artifactName = 'unit-test-coverage'

const newestFirst = (left, right) => right.created_at.localeCompare(left.created_at) || right.id - left.id

/** Returns { runId, artifactId, pull } for the merged pull request of `sha`, or { reason } when none qualifies. */
export async function findMergedUnitResults({ repository, sha, request }) {
  const pulls = await request(`/repos/${repository}/commits/${sha}/pulls?per_page=100`)
  const pull = pulls.find((candidate) => candidate.merged_at && candidate.merge_commit_sha === sha)
  if (!pull) return { reason: `no merged pull request has the merge commit ${sha}` }
  const head = pull.head.sha
  const { workflow_runs: runs } = await request(
    `/repos/${repository}/actions/workflows/test.yml/runs?event=pull_request&status=success&head_sha=${head}&per_page=100`,
  )
  // A run from a fork carries code that this repository did not review at that head.
  const run = runs
    .filter((candidate) => candidate.head_sha === head && candidate.event === 'pull_request' && candidate.conclusion === 'success' &&
      candidate.path === workflowPath && candidate.head_repository?.full_name === repository)
    .sort(newestFirst)[0]
  if (!run) return { reason: `pull request #${pull.number} has no successful PR Tests run at its head ${head}` }
  const { artifacts } = await request(`/repos/${repository}/actions/runs/${run.id}/artifacts?name=${artifactName}&per_page=100`)
  const artifact = artifacts
    .filter((candidate) => candidate.name === artifactName && !candidate.expired && candidate.workflow_run?.id === run.id)
    .sort(newestFirst)[0]
  if (!artifact) return { reason: `run ${run.id} of pull request #${pull.number} has no ${artifactName} artifact` }
  return { runId: run.id, artifactId: artifact.id, pull: pull.number }
}

/** The groups whose key in the stored keys equals the key of this run. */
export function matchKeys(storedKeys, currentKeys) {
  return Object.fromEntries(Object.keys(groups).map((group) =>
    [group, typeof currentKeys[group] === 'string' && currentKeys[group] !== '' && storedKeys?.[group] === currentKeys[group]]))
}

function currentKeys(environment) {
  const missing = Object.values(groups).filter((name) => !environment[name])
  if (missing.length) throw new Error(`${missing.join(', ')} not set`)
  return Object.fromEntries(Object.entries(groups).map(([group, name]) => [group, environment[name]]))
}

function githubRequest(environment) {
  const base = environment.GITHUB_API_URL || 'https://api.github.com'
  return async (path) => {
    const response = await fetch(`${base}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${environment.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!response.ok) throw new Error(`GET ${path} returned HTTP ${response.status}`)
    return response.json()
  }
}

function option(argv, name) {
  const index = argv.indexOf(name)
  return index === -1 || !argv[index + 1] || argv[index + 1].startsWith('--') ? undefined : argv[index + 1]
}

export async function main(argv, environment, write = (text) => process.stdout.write(text)) {
  const [command, ...rest] = argv
  if (command === '--help' || command === '-h') {
    write(`${usage}\n`)
    return 0
  }
  if (command === 'record' && rest.length === 0) {
    try {
      write(`${JSON.stringify(currentKeys(environment))}\n`)
      return 0
    } catch (error) {
      process.stderr.write(`merged-unit-results: ${error.message}\n`)
      return 1
    }
  }
  if (command === 'find' && rest.length === 4 && option(rest, '--repository') && option(rest, '--sha')) {
    if (!environment.GITHUB_TOKEN) {
      process.stderr.write('merged-unit-results: GITHUB_TOKEN not set\n')
      return 2
    }
    try {
      const found = await findMergedUnitResults({ repository: option(rest, '--repository'), sha: option(rest, '--sha'), request: githubRequest(environment) })
      if (found.reason) write(`::notice title=Unit tests run on main::${found.reason}\n`)
      else write(`artifact-id=${found.artifactId}\nrun-id=${found.runId}\npull=${found.pull}\n`)
    } catch (error) {
      write(`::warning title=Unit tests run on main::the merged pull request lookup failed: ${error.message}\n`)
    }
    return 0
  }
  if (command === 'match' && rest.length === 2 && option(rest, '--keys-file')) {
    let stored
    try {
      const keys = currentKeys(environment)
      try {
        stored = JSON.parse(readFileSync(option(rest, '--keys-file'), 'utf8'))
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
        write('::notice title=Unit tests run on main::the merged pull request stored no unit result keys\n')
      }
      write(Object.entries(matchKeys(stored, keys)).map(([group, equal]) => `${group}=${equal}\n`).join(''))
      return 0
    } catch (error) {
      process.stderr.write(`merged-unit-results: ${error.message}\n`)
      return 1
    }
  }
  process.stderr.write(`${usage}\n`)
  return 2
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), process.env)
}
