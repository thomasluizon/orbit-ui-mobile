import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

function findRepositoryRoot(directory: string): string {
  const manifest = join(directory, 'package.json')
  if (existsSync(manifest) && 'workspaces' in (JSON.parse(readFileSync(manifest, 'utf8')) as object)) return directory
  const parent = dirname(directory)
  if (parent === directory) throw new Error(`No package.json with workspaces above ${directory}`)
  return findRepositoryRoot(parent)
}

/**
 * The repository root, found by its `workspaces` manifest. Stryker runs a copy of this package in
 * `packages/shared/.stryker-tmp/sandbox-*`, so a fixed `../` depth from a test resolves to `packages/shared`.
 */
export const repositoryRoot = findRepositoryRoot(dirname(fileURLToPath(import.meta.url)))
