import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stringify } from 'yaml'

const apiRoot = resolve(process.argv[2])
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'astra-catalog-')))
const xml = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
try {
  const project = join(directory, 'Catalog.csproj')
  writeFileSync(project, `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="${xml(join(apiRoot, 'src/Orbit.Infrastructure/Orbit.Infrastructure.csproj'))}" />
    <Compile Include="${xml(join(apiRoot, 'src/Orbit.Infrastructure/AI/StrictToolSchema.cs'))}" Link="StrictToolSchema.cs" />
    <Compile Include="${xml(fileURLToPath(new URL('./catalog-export.cs', import.meta.url)))}" Link="Program.cs" />
  </ItemGroup>
</Project>`)
  const output = join(directory, 'catalog.json')
  const run = spawnSync('dotnet', ['run', '--project', project, '--artifacts-path', join(directory, 'artifacts'), '--', output], {
    cwd: apiRoot, stdio: 'inherit',
  })
  if (run.error) throw run.error
  if (run.status !== 0) throw new Error('API tool catalog export failed.')
  const catalog = JSON.parse(readFileSync(output, 'utf8'))
  for (const tool of catalog.filter(({ function: { name } }) => ['bulk_log_habits', 'bulk_skip_habits', 'bulk_delete_habits'].includes(name))) {
    tool.function.parameters.oneOf = [
      { required: ['habit_ids'], properties: { habit_ids: { type: 'array' }, filter: { type: 'null' } } },
      { required: ['filter'], properties: { filter: { type: 'object' }, habit_ids: { type: 'null' } } },
    ]
  }
  writeFileSync(new URL('./catalog.yaml', import.meta.url),
    '# Generated from API tool schemas and StrictToolSchema; regenerate with generate-catalog.mjs.\n'
    + '# Optional arguments permit omission or null; all supplied values retain their producer constraints.\n'
    + stringify(catalog, { lineWidth: 120 }))
} finally {
  rmSync(directory, { recursive: true, force: true })
}
