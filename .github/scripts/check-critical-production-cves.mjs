#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const AUDIT_ATTEMPT_TIMEOUT_MS = 70_000
const SEVERITIES = new Set(['info', 'low', 'moderate', 'high', 'critical'])

function infrastructureFailure(detail, auditResult) {
  console.error(
    `Infrastructure error: npm registry or network failure prevented the production vulnerability audit from returning a valid advisory report (${detail}). No CVE verdict was produced.`,
  )

  if (auditResult?.stderr) {
    console.error(auditResult.stderr.trim())
  }

  process.exitCode = 2
}

function parseAuditReport(stdout) {
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
      Array.isArray(vulnerability.via),
  )

  return valid ? vulnerabilities : null
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

const auditArguments = [
  'audit',
  '--omit=dev',
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
function runAudit() {
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

let auditResult = runAudit()
let vulnerabilities = auditResult.error ? null : parseAuditReport(auditResult.stdout)

if (!vulnerabilities) {
  console.error('npm audit did not return a valid advisory report; retrying once.')
  auditResult = runAudit()
  vulnerabilities = auditResult.error ? null : parseAuditReport(auditResult.stdout)
}

if (!vulnerabilities) {
  infrastructureFailure(failureDetail(auditResult), auditResult)
} else {
  const criticalAdvisories = vulnerabilities.filter(
    (vulnerability) => vulnerability.severity === 'critical',
  )

  if (criticalAdvisories.length > 0) {
    console.error('Critical production advisory found:')
    for (const vulnerability of criticalAdvisories) {
      console.error(`- ${advisoryLabel(vulnerability)}`)
    }
    process.exitCode = 1
  } else {
    console.log('Production audit passed: no critical vulnerabilities found.')
  }
}
