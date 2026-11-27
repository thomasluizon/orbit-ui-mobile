/**
 * Runs inside a workspace folder. It reads the Vitest projects of the workspace and prints one JSON value:
 * `project-of <test file>` prints the name of the project that runs the file, or null.
 * `related <project> <file>...` prints the test files of the project that import one of the files, as `vitest related` selects them.
 */

import { resolve } from "node:path"
import { createVitest } from "vitest/node"

const [mode, ...args] = process.argv.slice(2)
const root = process.cwd()
const open = (options) => createVitest("test", { root, watch: false, run: true, coverage: { enabled: false }, reporters: [], ...options }, {}, {})

let output
const context = mode === "related"
  ? await open({ project: [args[0]], related: args.slice(1).map((file) => resolve(root, file)) })
  : await open({})
try {
  if (mode === "project-of") {
    const specifications = await context.globTestSpecifications([args[0]])
    output = specifications.find((specification) => specification.moduleId === resolve(root, args[0]))?.project.name ?? null
  } else if (mode === "related") {
    output = (await context.getRelevantTestSpecifications()).map((specification) => specification.moduleId)
  } else throw new Error(`unknown mode ${mode}`)
} finally {
  await context.close()
}
process.stdout.write(`\n@@RESULT@@${JSON.stringify(output)}\n`)
process.exit(0)
