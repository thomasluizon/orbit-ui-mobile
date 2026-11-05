import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Usage: node evals/astra/generate-snapshot-fixture.mjs <api-checkout>')
  const apiRoot = realpathSync(resolve(process.argv[2]))
  const apiCommit = execFileSync('git', ['-C', apiRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (execFileSync('git', ['-C', apiRoot, 'status', '--porcelain'], { encoding: 'utf8' }).trim()) {
    throw new Error('Snapshot fixture generation requires a clean API checkout.')
  }
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'astra-snapshot-')))
  const xml = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
  try {
    const project = join(directory, 'Snapshot.csproj')
    writeFileSync(project, `<Project Sdk="Microsoft.NET.Sdk">
    <PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup>
    <ItemGroup>
      <ProjectReference Include="${xml(join(apiRoot, 'src/Orbit.Api/Orbit.Api.csproj'))}" />
      <Compile Include="${xml(fileURLToPath(new URL('./snapshot-fixture.cs', import.meta.url)))}" Link="Program.cs" />
    </ItemGroup>
  </Project>`)
    execFileSync('dotnet', ['run', '--project', project, '--artifacts-path', join(directory, 'artifacts'),
      '-p:OpenApiGenerateDocuments=false', '--', fileURLToPath(new URL('./__tests__/fixtures/eval-snapshot.json', import.meta.url)), apiCommit],
    { cwd: apiRoot, stdio: 'inherit' })
  } finally { rmSync(directory, { recursive: true, force: true }) }
}
