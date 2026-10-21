import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const sharedRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const generatedDirectory = 'src/types/__generated__'
export const contractFiles = ['api.generated.ts', 'api.spec.commit', 'api.spec.selection.json']
const identityKeys = ['id', 'httpVersion', 'revision', 'documentName', 'path']
const catalogKeys = [...identityKeys, 'deprecated', 'replacement']

export function validateCommit(commit) {
  if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error('The orbit-api commit pin must be a full 40-character SHA.')
  }
  return commit
}

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',')
}

function canonicalIdentity(id) {
  const match = typeof id === 'string' && /^orbit-http-v([12])-r([1-9][0-9]*)$/.exec(id)
  if (!match) throw new Error('Unknown artifact identity.')
  const [, version, revision] = match
  const documentName = `v${version}${revision === '1' ? '' : `-r${revision}`}`
  return {
    id, httpVersion: `${version}.0`, revision: `r${revision}`, documentName,
    path: `src/Orbit.Api/openapi${documentName === 'v1' ? '' : `_${documentName}`}.json`,
  }
}

export function validateSelection(selection) {
  if (!exactKeys(selection, ['id', 'httpVersion'])) throw new Error('Invalid contract selection metadata.')
  const identity = canonicalIdentity(selection.id)
  if (selection.httpVersion !== identity.httpVersion) throw new Error('Selection HTTP version mismatch.')
  return identity
}

export function readContract(root = sharedRoot) {
  const directory = resolve(root, generatedDirectory)
  const commit = validateCommit(readFileSync(resolve(directory, 'api.spec.commit'), 'utf8').trim())
  const path = resolve(directory, 'api.spec.selection.json')
  let metadata
  try {
    metadata = lstatSync(path)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return { commit, selection: undefined }
  }
  if (!metadata.isFile()) throw new Error('Contract selection metadata must be a regular file.')
  const selection = JSON.parse(readFileSync(path, 'utf8'))
  validateSelection(selection)
  return { commit, selection }
}

export function validateCatalog(catalog) {
  if (!Array.isArray(catalog) || catalog.length === 0) throw new Error('Invalid artifact catalog.')
  for (const row of catalog) {
    if (!exactKeys(row, catalogKeys)) throw new Error('Incomplete artifact descriptor.')
    const expected = canonicalIdentity(row.id)
    if (identityKeys.some((key) => row[key] !== expected[key]) || typeof row.deprecated !== 'boolean' ||
        (row.replacement !== null && typeof row.replacement !== 'string')) {
      throw new Error('Artifact identity, path or lifecycle mismatch.')
    }
  }
  for (const key of ['id', 'documentName', 'path']) {
    if (new Set(catalog.map((row) => row[key])).size !== catalog.length) throw new Error('Duplicate artifact.')
  }
  for (const row of catalog) {
    if (row.replacement === null) continue
    const replacement = catalog.find((candidate) => candidate.id === row.replacement)
    if (!row.deprecated || !replacement || replacement.deprecated || replacement.id === row.id ||
        replacement.httpVersion !== row.httpVersion) throw new Error('Invalid artifact replacement.')
  }
  if (['orbit-http-v1-r1', 'orbit-http-v2-r1'].some((id) => !catalog.some((row) => row.id === id))) {
    throw new Error('Incomplete catalog: legacy streams are required.')
  }
  return catalog
}

export function readProducerFile(commit, path) {
  validateCommit(commit)
  if (path !== 'src/Orbit.Api/OpenApi/artifacts.json' &&
      !/^src\/Orbit\.Api\/openapi(?:_v2|_v[12]-r[1-9][0-9]*)?\.json$/.test(path)) {
    throw new Error('Invalid producer artifact path.')
  }
  return execFileSync('curl', ['--fail', '--silent', '--show-error', '--max-time', '60',
    `https://raw.githubusercontent.com/thomasluizon/orbit-api/${commit}/${path}`],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
}

function validateReferences(value) {
  if (value === null || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (key === '$ref' && (typeof child !== 'string' || !child.startsWith('#/'))) {
      throw new Error('External document references are forbidden.')
    }
    validateReferences(child)
  }
}

export function validateDocument(document, identity, explicit) {
  if (explicit && (document?.openapi !== '3.1.1' || document.info?.version !== identity.httpVersion ||
      document.info.title !== `Orbit.Api | ${identity.documentName}` ||
      !document.paths || Object.keys(document.paths).length === 0)) throw new Error('Document HTTP version or identity mismatch.')
  if (explicit && identity.revision !== 'r1' &&
      !document.info.description?.startsWith(`Documentation revision ${identity.id} `)) {
    throw new Error('Document revision mismatch.')
  }
  validateReferences(document)
  return document
}

export function resolveContract({ commit, selection }, read = readProducerFile, override) {
  validateCommit(commit)
  if (override !== undefined && (!isAbsolute(override) || /[\r\n\0]/.test(override))) {
    throw new Error('ORBIT_OPENAPI_SPEC must be an absolute local document path for investigation.')
  }
  const identity = selection === undefined ? canonicalIdentity('orbit-http-v1-r1') : validateSelection(selection)
  if (selection !== undefined) {
    const catalog = validateCatalog(JSON.parse(read(commit, 'src/Orbit.Api/OpenApi/artifacts.json')))
    if (!catalog.some((row) => row.id === identity.id)) throw new Error('Selected artifact is unpublished.')
  }
  const raw = override === undefined ? read(commit, identity.path) : readFileSync(override, 'utf8')
  return validateDocument(JSON.parse(raw), identity, selection !== undefined)
}

export function contractOptions(document, target = `./${generatedDirectory}/api.generated.ts`) {
  const header = document.info?.description?.startsWith('Documentation revision ')
    ? { header: ({ title, version }) => ['Generated by orval 🍺', 'Do not edit manually.', title, `OpenAPI spec version: ${version}`] }
    : {}
  return {
    input: { target: document },
    output: { client: 'zod', mode: 'single', target, override: { zod: { version: 4 }, ...header } },
  }
}

export function loadContractOptions() {
  return contractOptions(resolveContract(readContract(), readProducerFile, process.env.ORBIT_OPENAPI_SPEC))
}
