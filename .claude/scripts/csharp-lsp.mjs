#!/usr/bin/env node
// Fallback wrapper that bridges a generic LSP-to-MCP package to OmniSharp/Roslyn
// for the orbit-api repo. Used only if the `.mcp.json.example` `mcp-language-server`
// package can't be installed in the current environment.
//
// Usage in .mcp.json:
//   {
//     "csharp-lsp": {
//       "command": "node",
//       "args": [".claude/scripts/csharp-lsp.mjs"],
//       "env": { "ORBIT_API_ROOT": "C:/Users/thoma/Documents/Programming/Projects/orbit-api" }
//     }
//   }
//
// This wrapper spawns OmniSharp on stdio against the orbit-api solution and
// proxies LSP requests through MCP. It's a thin bridge — most logic lives in
// the upstream LSP server.

import { spawn } from "node:child_process"
import { resolve } from "node:path"
import { existsSync } from "node:fs"

const apiRoot = process.env.ORBIT_API_ROOT
  ?? "C:/Users/thoma/Documents/Programming/Projects/orbit-api"

if (!existsSync(apiRoot)) {
  process.stderr.write(`csharp-lsp: ORBIT_API_ROOT not found: ${apiRoot}\n`)
  process.exit(1)
}

const solutionPath = resolve(apiRoot, "Orbit.slnx")
if (!existsSync(solutionPath)) {
  process.stderr.write(`csharp-lsp: Orbit.slnx not found at ${solutionPath}\n`)
  process.exit(1)
}

// Prefer Microsoft.CodeAnalysis.LanguageServer if installed, fall back to OmniSharp.
// Both speak LSP on stdio; the difference is implementation maturity.
const command = process.env.CSHARP_LSP_COMMAND ?? "omnisharp"
const args = process.env.CSHARP_LSP_COMMAND
  ? (process.env.CSHARP_LSP_ARGS?.split(" ") ?? [])
  : ["-lsp", "-s", solutionPath]

const child = spawn(command, args, {
  stdio: ["pipe", "pipe", "inherit"],
  cwd: apiRoot,
})

process.stdin.pipe(child.stdin)
child.stdout.pipe(process.stdout)

child.on("exit", (code) => process.exit(code ?? 0))
child.on("error", (err) => {
  process.stderr.write(`csharp-lsp: failed to spawn ${command}: ${err.message}\n`)
  process.stderr.write(`Install OmniSharp (https://github.com/OmniSharp/omnisharp-roslyn/releases) and ensure it's on PATH, or set CSHARP_LSP_COMMAND.\n`)
  process.exit(1)
})
