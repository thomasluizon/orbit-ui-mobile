import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const webDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const environment = {
  ...process.env,
  API_BASE: "http://127.0.0.1:5099",
  NEXT_PUBLIC_EVENT_API_BASE: "http://127.0.0.1:5099",
}

function run(argumentsList) {
  const result = spawnSync(process.execPath, argumentsList, {
    cwd: webDirectory,
    env: environment,
    stdio: "inherit",
  })
  if (result.error) process.stderr.write(`Hermetic build: ${result.error.message}\n`)
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run([require.resolve("next/dist/bin/next"), "build", "--webpack"])
run([resolve(webDirectory, "../../tools/check-hermetic-web-build.mjs")])
