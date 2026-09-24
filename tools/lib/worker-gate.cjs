const { spawn } = require("node:child_process")

let released = false
process.on("disconnect", () => { if (!released) process.exit(0) })
process.once("message", ({ executable, args, directory }) => {
  released = true
  const worker = spawn(executable, args, {
    cwd: directory,
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
  })
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
