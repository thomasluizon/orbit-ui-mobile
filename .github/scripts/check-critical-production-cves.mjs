#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const AUDIT_ATTEMPT_TIMEOUT_MS = 70_000
const SEVERITIES = new Set(['info', 'low', 'moderate', 'high', 'critical'])

function infrastructureFailure(detail, auditResult, retryMessage = '') {
  const commandError = auditResult?.stderr?.trim()
  const messages = [
    retryMessage,
    `Infrastructure error: npm registry or network failure prevented the production vulnerability audit from returning a valid advisory report (${detail}). No CVE verdict was produced.`,
    commandError,
  ].filter(Boolean)

  return { exitCode: 2, stderr: messages.join('\n'), stdout: '' }
}

export function parseAuditReport(stdout) {
  let report

  try {
    report = JSON.parse(stdout)
  } catch {
    return null
  }

  if (
    report?.auditReportVersion !== 2 ||
    !report.vulnerabilities ||
    typeof report.vulnerabilities !== 'object' ||
    Array.isArray(report.vulnerabilities)
  ) {
    return null
  }

  const vulnerabilities = Object.values(report.vulnerabilities)
  const valid = vulnerabilities.every(
    (vulnerability) =>
      vulnerability &&
      typeof vulnerability === 'object' &&
      typeof vulnerability.name === 'string' &&
      SEVERITIES.has(vulnerability.severity) &&
      Array.isArray(vulnerability.via) &&
      Array.isArray(vulnerability.nodes) &&
      vulnerability.nodes.length > 0 &&
      vulnerability.nodes.every((node) => typeof node === 'string'),
  )

  return valid ? vulnerabilities : null
}

function readPackageRecords() {
  try {
    const packageLock = JSON.parse(
      readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'),
    )

    if (
      !packageLock.packages ||
      typeof packageLock.packages !== 'object' ||
      Array.isArray(packageLock.packages)
    ) {
      return null
    }

    return packageLock.packages
  } catch {
    return null
  }
}

export function productionVulnerabilities(vulnerabilities, packageRecords) {
  const classified = vulnerabilities.map((vulnerability) => {
    const records = vulnerability.nodes.map((node) => packageRecords[node])
    if (records.some((record) => !record || typeof record !== 'object')) {
      return null
    }

    return {
      production: records.some((record) => record.dev !== true),
      vulnerability,
    }
  })

  if (classified.some((entry) => entry === null)) {
    return null
  }

  return classified
    .filter((entry) => entry.production)
    .map((entry) => entry.vulnerability)
}

function advisoryLabel(vulnerability) {
  const advisory = vulnerability.via.find(
    (via) => via && typeof via === 'object' && via.severity === 'critical',
  )

  if (!advisory || typeof advisory.title !== 'string' || typeof advisory.url !== 'string') {
    return vulnerability.name
  }

  return `${vulnerability.name}: ${advisory.title} (${advisory.url})`
}

function runAuditProcess() {
  const auditArguments = [
    'audit',
    '--audit-level=critical',
    '--json',
    '--fetch-retries=0',
    '--fetch-timeout=60000',
  ]
  const npmCommand = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm'
  const npmArguments =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', `npm ${auditArguments.join(' ')}`]
      : auditArguments

  return spawnSync(npmCommand, npmArguments, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: AUDIT_ATTEMPT_TIMEOUT_MS,
  })
}

function failureDetail(auditResult) {
  if (auditResult.error?.code === 'ETIMEDOUT') {
    return 'final audit attempt exceeded 70 seconds'
  }

  if (auditResult.error) {
    return `npm could not run: ${auditResult.error.message}`
  }

  return `npm exited ${auditResult.status ?? 'without a status'} after 2 attempts`
}

function verdict(vulnerabilities, packageRecords, retryMessage) {
  const production = productionVulnerabilities(vulnerabilities, packageRecords)
  if (!production) {
    return infrastructureFailure(
      'audit nodes could not be classified from package-lock.json',
      null,
      retryMessage,
    )
  }

  const criticalAdvisories = production.filter(
    (vulnerability) => vulnerability.severity === 'critical',
  )
  if (criticalAdvisories.length === 0) {
    return {
      exitCode: 0,
      stderr: retryMessage,
      stdout: 'Production audit passed: no critical vulnerabilities found.',
    }
  }

  const labels = criticalAdvisories.map((vulnerability) => `- ${advisoryLabel(vulnerability)}`)
  return {
    exitCode: 1,
    stderr: ['Critical production advisory found:', ...labels].join('\n'),
    stdout: '',
  }
}

export function runGate({ packageRecords = readPackageRecords(), runAudit = runAuditProcess } = {}) {
  if (!packageRecords) {
    return infrastructureFailure('package-lock.json could not be read')
  }

  let auditResult = runAudit()
  let vulnerabilities = auditResult.error ? null : parseAuditReport(auditResult.stdout)
  let retryMessage = ''

  if (!vulnerabilities) {
    retryMessage = 'npm audit did not return a valid advisory report; retrying once.'
    auditResult = runAudit()
    vulnerabilities = auditResult.error ? null : parseAuditReport(auditResult.stdout)
  }

  return vulnerabilities
    ? verdict(vulnerabilities, packageRecords, retryMessage)
    : infrastructureFailure(failureDetail(auditResult), auditResult, retryMessage)
}

function main() {
  const result = runGate()
  if (result.stdout) {
    console.log(result.stdout)
  }
  if (result.stderr) {
    console.error(result.stderr)
  }
  process.exitCode = result.exitCode
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
