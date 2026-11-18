// The directories that Claude Code adds to the working directories of a session from its settings files.
// Claude Code 2.1.325 reads `permissions.additionalDirectories` from each settings source: user, project,
// local and managed. ./README.md names the sources that a hook cannot read.

import { readFileSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

/** Where Claude Code keeps `managed-settings.json` and the `managed-settings.d` directory on each platform. */
const MANAGED_DIRECTORIES = { darwin: "/Library/Application Support/ClaudeCode", win32: "C:\\Program Files\\ClaudeCode" }
const managedSettingsDirectory = () => MANAGED_DIRECTORIES[process.platform] ?? "/etc/claude-code"

const managedDropIns = (managedDirectory) => {
  const directory = join(managedDirectory, "managed-settings.d")
  try { return readdirSync(directory).filter((name) => name.endsWith(".json")).map((name) => join(directory, name)) }
  catch (error) { if (error.code === "ENOENT" || error.code === "ENOTDIR") return []; throw error }
}

/** A missing file adds nothing. A file that does not parse adds nothing either: the stuck limit covers a prompt that this check then misses. */
const declaredDirectories = (path) => {
  let settings
  try { settings = JSON.parse(readFileSync(path, "utf8")) }
  catch (error) { if (error.code === "ENOENT" || error.code === "ENOTDIR" || error instanceof SyntaxError) return []; throw error }
  const declared = settings?.permissions?.additionalDirectories
  return Array.isArray(declared) ? declared.filter((entry) => typeof entry === "string" && entry) : []
}

/**
 * @param projectRoot the project directory of the session, which holds `.claude/settings.json`
 * @param options `{ configDirectory, home, managedDirectory }`, each defaulting to the place Claude Code reads
 * @returns the absolute path of each additional working directory; a relative entry resolves from the project directory
 */
export function additionalWorkingDirectories(projectRoot, { configDirectory = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), home = homedir(), managedDirectory = managedSettingsDirectory() } = {}) {
  const files = [
    join(configDirectory, "settings.json"),
    join(projectRoot, ".claude", "settings.json"),
    join(projectRoot, ".claude", "settings.local.json"),
    join(managedDirectory, "managed-settings.json"),
    ...managedDropIns(managedDirectory),
  ]
  const directories = files.flatMap(declaredDirectories).map((entry) => resolve(projectRoot, entry.replace(/^~(?=[\\/]|$)/, home)))
  return [...new Set(directories)]
}
