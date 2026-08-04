import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { TOOLS_DIR, root, stage, check } from "./_harness.mjs"

const captureSurfacesCases = () => {
  const fixture = join(root, "capture-surfaces-origin")
  const tools = join(fixture, "tools")
  mkdirSync(tools, { recursive: true })
  mkdirSync(join(tools, "lib"), { recursive: true })
  cpSync(join(TOOLS_DIR, "capture-surfaces.mjs"), join(tools, "capture-surfaces.mjs"))
  mkdirSync(join(tools, "lib"), { recursive: true })
  cpSync(join(TOOLS_DIR, "lib", "subprocess-options.mjs"), join(tools, "lib", "subprocess-options.mjs"))
  writeFileSync(
    join(tools, "orca-web-port.mjs"),
    `if (process.env.ORBIT_CAPTURE_FAIL === "1") { process.stderr.write("unassigned\\n"); process.exit(1) }\nprocess.stdout.write(process.env.ORBIT_CAPTURE_PORT ?? "3000")\n`,
  )
  const probe = stage(
    "capture-surfaces-origin/probe.mjs",
    `import { resolveBaseUrl } from "./tools/capture-surfaces.mjs"\nconsole.log(resolveBaseUrl(process.argv[2] === "none" ? null : process.argv[2]))\n`,
  )
  check("capture-surfaces.mjs", "uses the primary checkout default when no base URL is supplied", ["none"], { status: 0, stdout: /^http:\/\/localhost:3000\s*$/ }, { path: probe })
  check("capture-surfaces.mjs", "uses the linked worktree port when no base URL is supplied", ["none"], { status: 0, stdout: /^http:\/\/localhost:3286\s*$/ }, { path: probe, env: { ORBIT_CAPTURE_PORT: "3286" } })
  check("capture-surfaces.mjs", "keeps an explicit base URL over the assigned port", ["http://localhost:7777"], { status: 0, stdout: /^http:\/\/localhost:7777\s*$/ }, { path: probe, env: { ORBIT_CAPTURE_PORT: "3286" } })
  check("capture-surfaces.mjs", "refuses capture when a linked worktree has no assigned port", ["none"], { status: 1, stderr: /could not resolve this worktree's web port/ }, { path: probe, env: { ORBIT_CAPTURE_FAIL: "1" } })
}

export { captureSurfacesCases as cases }
