#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-hermetic-web-build.mjs [--build-dir <path>]

  Scans every file under a Next build's static directory for production and staging API hosts.
  Requires at least one client JavaScript file. Server output is outside this check.

  --build-dir <path>  Next output directory (default: apps/web/.next relative to this tool)
  --help, -h         print this usage and exit 0

exit codes: 0 clean client output, 1 forbidden API host, 2 invalid input or unreadable build`

const FORBIDDEN_HOSTS = ["api.useorbit.org", "api-staging.useorbit.org"]
let buildDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/web/.next")
const argumentsList = process.argv.slice(2)
if (argumentsList.includes("--help") || argumentsList.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
for (let index = 0; index < argumentsList.length; index++) {
  if (argumentsList[index] !== "--build-dir" || !argumentsList[index + 1] || argumentsList[index + 1].startsWith("-")) {
    console.error(USAGE)
    process.exit(2)
  }
  buildDirectory = resolve(argumentsList[++index])
}

function clientFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return clientFiles(path)
    if (!entry.isFile()) throw new Error(`Expected a regular client file: ${path}`)
    return [path]
  })
}

try {
  const files = clientFiles(join(buildDirectory, "static"))
  if (!files.some((path) => path.endsWith(".js"))) throw new Error("No client JavaScript files found")
  const violations = files.flatMap((path) => {
    const contents = readFileSync(path)
    return FORBIDDEN_HOSTS.filter((host) => contents.includes(host))
      .map((host) => `${relative(buildDirectory, path)}: ${host}`)
  })
  if (violations.length > 0) {
    console.error(`Hermetic client output contains forbidden API hosts:\n${violations.join("\n")}`)
    process.exit(1)
  }
  console.log(`Hermetic client output checked: ${files.length} files, no production or staging API hosts.`)
} catch (error) {
  console.error(`check-hermetic-web-build: ${error.message}`)
  process.exit(2)
}
