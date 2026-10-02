const { spawn } = require("node:child_process")
const { writeSync } = require("node:fs")

let released = false
process.on("disconnect", () => { if (!released) process.exit(0) })
process.once("message", ({ executable, args, directory, input, reportDescriptor }) => {
  released = true
  const worker = spawn(executable, args, {
    cwd: directory,
    stdio: [input === undefined ? "ignore" : "pipe", reportDescriptor == null ? "inherit" : "pipe", "inherit"],
    windowsHide: true,
  })
  if (reportDescriptor != null) {
    worker.stdout.on("data", (chunk) => {
      writeSync(reportDescriptor, chunk)
      writeSync(1, chunk)
    })
  }
  if (input !== undefined) {
    worker.stdin.on("error", (error) => { if (error.code !== "EPIPE") throw error })
    worker.stdin.end(input)
  }
  worker.on("error", (error) => {
    console.error(error.message)
    process.exitCode = 3
    if (process.connected) process.send({ type: "SPAWN_FAILED" }, () => process.disconnect())
  })
  worker.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0)
    if (process.connected) process.disconnect()
  })
})
