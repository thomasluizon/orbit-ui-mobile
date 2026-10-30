import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tsImport } from 'tsx/esm/api'
import { stringify } from 'yaml'

if (!process.argv[2]) throw new Error('Usage: node evals/astra/generate-catalog.mjs <api-checkout>')
const { CHAT_BLOCK_KINDS } = await tsImport('../../packages/shared/src/chat/block-kinds.ts', import.meta.url)
const apiRoot = realpathSync(resolve(process.argv[2]))
function cleanApiCommit() {
  const git = (arguments_) => execFileSync('git', ['-C', apiRoot, ...arguments_], { encoding: 'utf8' }).trim()
  if (git(['status', '--porcelain']).length) throw new Error('Catalog generation requires a clean API checkout.')
  return git(['rev-parse', 'HEAD'])
}
const apiCommit = cleanApiCommit()
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'astra-catalog-')))
const xml = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
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
  if (run.status !== 0) throw new Error('API tool catalog export failed.')
  const catalogs = JSON.parse(readFileSync(output, 'utf8'))
  if (cleanApiCommit() !== apiCommit) throw new Error('API commit changed during catalog generation.')
  writeFileSync(new URL('./catalog.yaml', import.meta.url),
    '# Generated through the API request builder, StrictToolSchema and eval trace sensitivity collector.\n'
    + '# Regenerate with node evals/astra/generate-catalog.mjs <api-checkout>.\n'
    + stringify({ apiCommit, ...catalogs }, { lineWidth: 120 }))
} finally {
  rmSync(directory, { recursive: true, force: true })
}
