import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const usage = `Usage: node tools/desktop-bench/run.mjs --output <absolute-directory> [--runs <count>]
Build both unsigned native shells and the hermetic web app, then measure five or more cold/warm pairs per shell.
Runs only on macOS or Windows with Node, npm, Rust and native build tools installed.
--output  Results and temporary build workspace outside the repository.
--runs    Pairs per shell, integer at least 5 (default 5).
--help, -h  Print usage. No stdin. Exit 0: measured; 1: build/measurement failed; 2: invalid input.
`
const directory = dirname(fileURLToPath(import.meta.url))
const repository = resolve(directory, '../..')
const argumentsList = process.argv.slice(2)
if (argumentsList.includes('--help') || argumentsList.includes('-h')) { process.stdout.write(usage); process.exit(0) }
let output
let repetitions = 5
try {
  for (let index = 0; index < argumentsList.length; index++) {
    const flag = argumentsList[index]
    const value = argumentsList[++index]
    if (flag === '--output' && value && isAbsolute(value)) output = resolve(value)
    else if (flag === '--runs' && /^\d+$/.test(value ?? '') && Number(value) >= 5) repetitions = Number(value)
    else throw new Error(`Invalid option: ${flag}`)
  }
  if (!output || output === repository || output.startsWith(`${repository}${sep}`)) throw new Error('--output must be outside the repository')
} catch (error) {
  process.stderr.write(`${error.message}\n${usage}`)
  process.exit(2)
}
try {
  const { benchmark } = await import('./runner.mjs')
  await benchmark({ repository, directory, output, repetitions })
} catch (error) {
  process.stderr.write(`desktop-bench: ${error.stack}\n`)
  process.exitCode = 1
}
