/**
 * Build the environment for a headless child.
 *
 * Workers and reviewers need the runtime, Codex home, and proxy settings, but
 * they do not need GitHub, Linear, or harness signing credentials. Keeping the
 * list here makes that boundary auditable and prevents a newly added secret
 * from flowing into a child by accident.
 */

const RUNTIME_KEYS = [
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "OS",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_IDENTIFIER",
  "NUMBER_OF_PROCESSORS",
  "HOME",
  "CODEX_HOME",
  "NPM_CONFIG_USERCONFIG",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "CI",
]

const INTERNAL_KEYS = {
  worker: ["ORBIT_LAUNCH_WORKER", "ORBIT_WORKER_LAUNCH_ID"],
  reviewer: ["ORBIT_LAUNCH_PR_REVIEW"],
  supervisor: ["ORBIT_LAUNCH_WORKER", "ORBIT_WORKER_LAUNCH_ID", "ORBIT_WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY"],
}

const valueFor = (environment, key) => {
  const actual = Object.keys(environment).find((candidate) => candidate.toLowerCase() === key.toLowerCase())
  return actual === undefined ? undefined : environment[actual]
}

const allowedKeys = (purpose, allowTestControls) => [
  ...RUNTIME_KEYS,
  ...(INTERNAL_KEYS[purpose] ?? []),
  ...(allowTestControls ? ["ORBIT_HARNESS_TEST"] : []),
]

export const minimalChildEnvironment = (purpose, source = process.env) => {
  if (!Object.hasOwn(INTERNAL_KEYS, purpose)) throw new Error(`unknown child environment purpose: ${purpose}`)
  const allowTestControls = valueFor(source, "ORBIT_HARNESS_TEST") === "1"
  const result = {}
  for (const key of allowedKeys(purpose, allowTestControls)) {
    const value = valueFor(source, key)
    if (value !== undefined) result[key] = value
  }
  if (allowTestControls) {
    for (const [key, value] of Object.entries(source)) {
      if (key.startsWith("ORBIT_TEST_")) result[key] = value
    }
  }
  return result
}

export const childEnvironmentAllowedKeys = (purpose) => allowedKeys(purpose, false)
