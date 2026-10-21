import { readFileSync, writeFileSync, mkdtempSync, rmSync, renameSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generate } from 'orval'
import {
  contractOptions, generatedDirectory, readContract, resolveContract, sharedRoot, validateCommit,
} from './contract-source.mjs'

const usage = 'usage: generate-contract.mjs [--check | --candidate <full-producer-SHA>]\nExit: 0 success, 1 invalid input, generation failure or stale snapshot.'

export async function regenerate({ root = sharedRoot, candidate, check = false, read, generator = generate } = {}) {
  if (process.env.ORBIT_OPENAPI_SPEC !== undefined) throw new Error('Investigation overrides cannot generate the committed contract. Use Orval directly.')
  const current = readContract(root)
  const commit = candidate === undefined ? current.commit : validateCommit(candidate)
  const document = resolveContract({ ...current, commit }, read)
  const directory = resolve(root, generatedDirectory)
  const staging = mkdtempSync(resolve(directory, '.contract-'))
  try {
    const output = resolve(staging, 'api.generated.ts')
    await generator(contractOptions(document, output), root, { throwOnError: true })
    const generated = readFileSync(output)
    if (generated.length === 0) throw new Error('Contract generation produced no output.')
    if (check) {
      if (!generated.equals(readFileSync(resolve(directory, 'api.generated.ts')))) throw new Error('Stale contract snapshot. Run npm run generate:zod -w @orbit/shared.')
      return
    }
    const previous = readFileSync(resolve(directory, 'api.generated.ts'))
    try {
      renameSync(output, resolve(directory, 'api.generated.ts'))
      writeFileSync(resolve(directory, 'api.spec.commit'), `${commit}\n`)
    } catch (error) {
      writeFileSync(resolve(directory, 'api.generated.ts'), previous)
      writeFileSync(resolve(directory, 'api.spec.commit'), `${current.commit}\n`)
      throw error
    }
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

async function main(argv) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) {
    process.stdout.write(`${usage}\n`)
    return
  }
  let options = {}
  if (argv.length === 1 && argv[0] === '--check') options = { check: true }
  else if (argv.length === 2 && argv[0] === '--candidate') options = { candidate: validateCommit(argv[1]) }
  else if (argv.length !== 0) throw new Error(usage)
  const require = createRequire(import.meta.url)
  if (require('orval/package.json').version !== '8.37.0') throw new Error('Orval must be pinned to 8.37.0.')
  await regenerate(options)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
