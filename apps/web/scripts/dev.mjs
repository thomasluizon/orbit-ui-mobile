import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const portTool = join(scriptDirectory, "..", "..", "..", "tools", "orca-web-port.mjs")
const child = spawn(process.execPath, [portTool, "--next-dev"], { stdio: "inherit" })

child.on("error", (error) => {
  console.error(`web dev: ${error.message}`)
  process.exit(1)
})
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
