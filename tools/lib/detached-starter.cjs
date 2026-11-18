// Opens the output files, starts the requested command in its own session, prints its pid and exits, so the command's parent is gone.
const { spawn } = require("node:child_process")
const { openSync } = require("node:fs")

const request = JSON.parse(process.argv[2])
const child = spawn(request.command, request.args, {
  cwd: request.cwd,
  detached: true,
  stdio: ["ignore", openSync(request.stdoutPath, "a"), openSync(request.stderrPath, "a")],
  windowsHide: true,
})
child.once("error", (error) => { process.stderr.write(error.message); process.exit(1) })
child.once("spawn", () => { child.unref(); process.stdout.write(String(child.pid), () => process.exit(0)) })
