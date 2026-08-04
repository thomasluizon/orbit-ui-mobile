#!/usr/bin/env node

/**
 * Bidirectional inventory gate for the native Codex adapter layer.
 *
 * Claude owns behavior. Codex owns only references to that behavior, so a direct
 * Claude skill or agent without its corresponding adapter makes native Codex
 * incomplete, while an adapter whose source vanished is a stale interface that
 * can claim a capability no longer exists. Both directions must fail.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const USAGE = `usage: check-codex-adapters.mjs [--root <repository-root>]

Checks the bidirectional inventory between the canonical Claude harness and its
thin native Codex adapters.

  --root <repository-root>  check a fixture or repository root (default: this repository)
  --help, -h                print this usage and exit 0

exit codes: 0 adapter inventory is complete, 1 inventory mismatch, 2 usage error`

function usageError(message) {
  console.error(`check-codex-adapters: ${message}\n`)
  console.error(USAGE)
  process.exit(2)
}

function parseArguments() {
  const argumentsList = process.argv.slice(2)
  if (argumentsList.includes("--help") || argumentsList.includes("-h")) return { help: true }
  let root = REPO_ROOT
  let hasRoot = false
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index]
    if (argument !== "--root") usageError(`unknown argument: ${argument}`)
    if (hasRoot) usageError("--root may only be provided once")
    const value = argumentsList[index + 1]
    if (!value || value.startsWith("--")) usageError("--root requires a repository root")
    root = resolve(value)
    hasRoot = true
    index += 1
  }
  if (!existsSync(root) || !statSync(root).isDirectory()) usageError(`root is not a directory: ${root}`)
  return { help: false, root }
}

function directSkillNames(root) {
  const skillsRoot = join(root, ".claude", "skills")
  if (!existsSync(skillsRoot) || !statSync(skillsRoot).isDirectory()) return { names: [], problem: ".claude/skills is missing" }
  return {
    names: readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
      .filter((entry) => existsSync(join(skillsRoot, entry.name, "SKILL.md")) && statSync(join(skillsRoot, entry.name, "SKILL.md")).isFile())
      .map((entry) => entry.name)
      .sort(),
    problem: null,
  }
}

function canonicalAgentNames(root) {
  const agentsRoot = join(root, ".claude", "agents")
  if (!existsSync(agentsRoot) || !statSync(agentsRoot).isDirectory()) return { names: [], problem: ".claude/agents is missing" }
  return {
    names: readdirSync(agentsRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name.slice(0, -".md".length).toLowerCase())
      .sort(),
    problem: null,
  }
}

function canonicalAgentFiles(root) {
  const agentsRoot = join(root, ".claude", "agents")
  if (!existsSync(agentsRoot) || !statSync(agentsRoot).isDirectory()) return new Map()
  return new Map(
    readdirSync(agentsRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => [entry.name.slice(0, -".md".length).toLowerCase(), entry.name]),
  )
}

function entriesAt(root, relativeDirectory, matcher) {
  const directory = join(root, relativeDirectory)
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return { entries: [], problem: `${relativeDirectory} is missing` }
  return {
    entries: readdirSync(directory, { withFileTypes: true })
      .filter(matcher)
      .map((entry) => entry.name)
      .sort(),
    problem: null,
  }
}

function verify(root) {
  const findings = []
  const skills = directSkillNames(root)
  const agents = canonicalAgentNames(root)
  const agentFiles = canonicalAgentFiles(root)
  if (skills.problem) findings.push(skills.problem)
  if (agents.problem) findings.push(agents.problem)

  const skillAdapters = entriesAt(root, ".agents/skills", (entry) => entry.isDirectory())
  const agentAdapters = entriesAt(root, ".codex/agents", (entry) => entry.isFile() && entry.name.endsWith(".toml"))
  if (skillAdapters.problem) findings.push(skillAdapters.problem)
  if (agentAdapters.problem) findings.push(agentAdapters.problem)

  for (const name of skills.names) {
    const adapterPath = join(root, ".agents", "skills", name, "SKILL.md")
    if (!existsSync(adapterPath) || !statSync(adapterPath).isFile()) {
      findings.push(`missing skill adapter: .agents/skills/${name}/SKILL.md for .claude/skills/${name}/SKILL.md`)
      continue
    }
    const adapter = readFileSync(adapterPath, "utf8")
    if (adapter.length > 700 || !adapter.includes(`.claude/skills/${name}/SKILL.md`) || !/source is authoritative/i.test(adapter)) {
      findings.push(`invalid skill adapter: .agents/skills/${name}/SKILL.md must be a thin pass-through to .claude/skills/${name}/SKILL.md`)
    }
  }
  for (const name of skillAdapters.entries) {
    if (!skills.names.includes(name)) findings.push(`orphan skill adapter: .agents/skills/${name}/SKILL.md has no canonical .claude/skills/${name}/SKILL.md`)
    else if (!existsSync(join(root, ".agents", "skills", name, "SKILL.md"))) findings.push(`invalid skill adapter: .agents/skills/${name} has no SKILL.md`)
  }

  for (const name of agents.names) {
    const adapterPath = join(root, ".codex", "agents", `${name}.toml`)
    if (!existsSync(adapterPath) || !statSync(adapterPath).isFile()) {
      findings.push(`missing agent adapter: .codex/agents/${name}.toml for .claude/agents/${name}.md`)
      continue
    }
    const adapter = readFileSync(adapterPath, "utf8")
    const canonicalFile = agentFiles.get(name)
    if (!new RegExp(`^name\\s*=\\s*"${name}"`, "m").test(adapter) || !/^description\s*=\s*"/m.test(adapter) || !/^developer_instructions\s*=\s*"/m.test(adapter) || !adapter.includes(`.claude/agents/${canonicalFile}`) || !/source is authoritative/i.test(adapter) || /^(tools|permissions|sandbox)\s*=/m.test(adapter)) {
      findings.push(`invalid agent adapter: .codex/agents/${name}.toml must defer to .claude/agents/${canonicalFile} without unconfirmed permission fields`)
    }
  }
  for (const name of agentAdapters.entries.map((entry) => entry.slice(0, -".toml".length))) {
    if (!agents.names.includes(name)) findings.push(`orphan agent adapter: .codex/agents/${name}.toml has no canonical .claude/agents/${name}.md`)
  }

  const configPath = join(root, ".codex", "config.toml")
  if (!existsSync(configPath) || !statSync(configPath).isFile()) findings.push(".codex/config.toml is missing")
  else {
    const config = readFileSync(configPath, "utf8")
    if (!/^model\s*=\s*"gpt-5\.6-sol"\s*$/m.test(config) || !/^model_reasoning_effort\s*=\s*"high"\s*$/m.test(config) || /^hooks\s*=/m.test(config)) {
      findings.push(".codex/config.toml must contain only the confirmed Sol/high project defaults")
    }
  }

  const hooksPath = join(root, ".codex", "hooks.json")
  const nativeEvents = ["SessionEnd", "SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "SubagentStart", "SubagentStop", "Stop"]
  if (!existsSync(hooksPath) || !statSync(hooksPath).isFile()) findings.push(".codex/hooks.json is missing")
  else {
    try {
      const hooks = JSON.parse(readFileSync(hooksPath, "utf8"))
      const actualEvents = Object.keys(hooks.hooks ?? {})
      if (actualEvents.length !== nativeEvents.length || actualEvents.some((event) => !nativeEvents.includes(event))) findings.push(".codex/hooks.json does not match the installed Codex hook event inventory")
      for (const event of nativeEvents) {
        const rows = hooks.hooks?.[event]
        const command = rows?.[0]?.hooks?.[0]
        if (!Array.isArray(rows) || !Array.isArray(rows[0]?.hooks) || command?.type !== "command" || command.command !== "node .codex/hooks/lifecycle-adapter.mjs" || !Number.isSafeInteger(command.timeout) || command.timeout < 1) {
          findings.push(`invalid native hook registration: ${event}`)
        }
      }
    } catch (error) {
      findings.push(`.codex/hooks.json is not valid JSON: ${error.message}`)
    }
  }

  return findings
}

const options = parseArguments()
if (options.help) {
  console.log(USAGE)
  process.exit(0)
}

const findings = verify(options.root)
if (findings.length > 0) {
  console.error(`Codex adapter inventory failed for ${relative(REPO_ROOT, options.root) || "."}:`)
  for (const finding of findings) console.error(`  ${finding}`)
  process.exit(1)
}

const skills = directSkillNames(options.root)
const agents = canonicalAgentNames(options.root)
console.log(`codex adapter inventory ok: ${skills.names.length} skills and ${agents.names.length} agents`)
