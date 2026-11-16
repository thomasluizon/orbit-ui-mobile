import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tsImport } from 'tsx/esm/api'
import { parse, stringify } from 'yaml'

const usage = 'Usage: node evals/astra/generate-catalog.mjs <api-checkout>, or --check [<api-repository>]'
const catalogUrl = new URL('./catalog.yaml', import.meta.url)
// The public orbit-api repository. The check fetches the catalog's commit from it unless the caller names another one.
const publicApiRepository = 'https://github.com/thomasluizon/orbit-api.git'
const git = (root, arguments_) => execFileSync('git', ['-C', root, ...arguments_], { encoding: 'utf8' }).trim()
const xml = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')

function cleanApiCommit(apiRoot) {
  if (git(apiRoot, ['status', '--porcelain']).length) throw new Error('Catalog generation requires a clean API checkout.')
  return git(apiRoot, ['rev-parse', 'HEAD'])
}

async function exportCatalog(apiCheckout) {
  const apiRoot = realpathSync(resolve(apiCheckout))
  const apiCommit = cleanApiCommit(apiRoot)
  const { CHAT_BLOCK_KINDS } = await tsImport('../../packages/shared/src/chat/block-kinds.ts', import.meta.url)
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'astra-catalog-')))
  try {
    const project = join(directory, 'Catalog.csproj')
    writeFileSync(project, `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="${xml(join(apiRoot, 'src/Orbit.Api/Orbit.Api.csproj'))}" />
    <Compile Include="${xml(fileURLToPath(new URL('./catalog-export.cs', import.meta.url)))}" Link="Program.cs" />
    <Compile Include="${xml(fileURLToPath(new URL('./catalog-constructor.cs', import.meta.url)))}" Link="CatalogConstructor.cs" />
  </ItemGroup>
</Project>`)
    const output = join(directory, 'catalog.json')
    const run = spawnSync('dotnet', ['run', '--project', project, '--artifacts-path', join(directory, 'artifacts'),
      '-p:OpenApiGenerateDocuments=false', '--', output, JSON.stringify(CHAT_BLOCK_KINDS)], {
      cwd: apiRoot, stdio: 'inherit',
    })
    if (run.error) throw run.error
    if (run.status !== 0) throw new Error(`API tool catalog export failed at API ${apiCommit}.`)
    const catalogs = JSON.parse(readFileSync(output, 'utf8'))
    if (cleanApiCommit(apiRoot) !== apiCommit) throw new Error('API commit changed during catalog generation.')
    return '# Generated through the API request and continuation builders, StrictToolSchema and eval trace sensitivity collector.\n'
      + '# Regenerate with node evals/astra/generate-catalog.mjs <api-checkout>.\n'
      + stringify({ apiCommit, ...catalogs }, { lineWidth: 120 })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

// Builds and runs the exporter against the API commit that catalog.yaml names, so API drift that breaks the exporter
// or changes the catalog fails here and not at the start of a live run.
async function checkCatalog(repository) {
  const committed = readFileSync(catalogUrl, 'utf8')
  const { apiCommit } = parse(committed)
  if (!/^[0-9a-f]{40}$/.test(apiCommit ?? '')) throw new Error('catalog.yaml names no full API commit.')
  const checkout = realpathSync(mkdtempSync(join(tmpdir(), 'astra-catalog-api-')))
  try {
    execFileSync('git', ['init', '--quiet', checkout])
    git(checkout, ['fetch', '--quiet', '--depth', '1', repository, apiCommit])
    git(checkout, ['checkout', '--quiet', '--detach', 'FETCH_HEAD'])
    if (await exportCatalog(checkout) !== committed) {
      throw new Error(`catalog.yaml differs from the exporter output at API ${apiCommit}. Regenerate it from a clean API `
        + 'checkout at that commit with node evals/astra/generate-catalog.mjs <api-checkout>.')
    }
  } finally {
    rmSync(checkout, { recursive: true, force: true })
  }
  process.stdout.write(`catalog.yaml matches the exporter output at API ${apiCommit}.\n`)
}

const [mode, argument] = process.argv.slice(2)
if (mode === '--check') await checkCatalog(argument && existsSync(argument) ? realpathSync(argument) : argument ?? publicApiRepository)
else if (mode) writeFileSync(catalogUrl, await exportCatalog(mode))
else throw new Error(usage)
