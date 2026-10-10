import { mkdirSync } from "node:fs"
import { join } from "node:path"

import { check, root, stage } from "./_harness.mjs"

const buildFixture = (label, files) => {
  const directory = join(root, "hermetic-web-build", label)
  mkdirSync(join(directory, "static"), { recursive: true })
  for (const [path, contents] of Object.entries(files)) {
    stage(join("hermetic-web-build", label, path), contents)
  }
  return directory
}

export const cases = () => {
  const accepted = buildFixture("mock", {
    "static/chunks/app.js": 'new EventSource("http://127.0.0.1:5099/api/events?ticket=hermetic-account");fetch("http://127.0.0.1:5099/health")',
    "server/app.js": 'fetch("https://api.useorbit.org")',
  })
  check("check-hermetic-web-build.mjs", "accepts mock stream and wake destinations from another cwd", ["--build-dir", accepted], {
    status: 0, stdout: /checked: 1 files/,
  }, { cwd: root })

  const rejected = buildFixture("remote", {
    "static/chunks/app.js": 'new EventSource("https://api.useorbit.org/api/events");fetch("https://api.useorbit.org/health")',
    "static/chunks/nested/app.js": 'fetch("https://api-staging.useorbit.org/health")',
    "static/config.json": '{"api":"https://api.useorbit.org"}',
  })
  check("check-hermetic-web-build.mjs", "reports production and staging hosts in every client file", ["--build-dir", rejected], {
    status: 1, stderr: /static\/chunks\/app.js: api.useorbit.org[\s\S]*nested\/app.js: api-staging.useorbit.org[\s\S]*config.json: api.useorbit.org/,
  })
  const staging = buildFixture("staging", { "static/chunks/app.js": 'fetch("https://api-staging.useorbit.org/health")' })
  check("check-hermetic-web-build.mjs", "rejects a staging-only bundle", ["--build-dir", staging], { status: 1 })
  const empty = buildFixture("empty", {})
  check("check-hermetic-web-build.mjs", "rejects empty output", ["--build-dir", empty], { status: 2, stderr: /No client JavaScript/ })
  const assets = buildFixture("assets", { "static/style.css": "body{}" })
  check("check-hermetic-web-build.mjs", "rejects output without client JavaScript", ["--build-dir", assets], { status: 2 })
  check("check-hermetic-web-build.mjs", "rejects a missing build", ["--build-dir", join(root, "absent-build")], { status: 2 })
  check("check-hermetic-web-build.mjs", "rejects a missing directory argument", ["--build-dir"], { status: 2 })
}
