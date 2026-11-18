import { expect, it } from 'vitest'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const generator = fileURLToPath(new URL('../generate-catalog.mjs', import.meta.url))
const { apiCommit } = parse(readFileSync(new URL('../catalog.yaml', import.meta.url), 'utf8'))
// The offline check never reads an eval target, even when the caller's shell names one.
const offlineEnvironment = { ...process.env }
delete offlineEnvironment.ORBIT_EVAL_BASE_URL

// The exporter must build and run against the real API, not a hand-written copy of its interfaces. This proves the
// exporter, the generator, CHAT_BLOCK_KINDS and catalog.yaml against the commit that the catalog names. That commit
// never moves, so orbit-api drift after it does not reach this test. ORBIT_API_REPOSITORY names a local orbit-api
// repository to fetch the catalog's commit from; the default is the public GitHub repository.
it('builds and runs the exporter against the API commit that the catalog names and reproduces the catalog', () => {
  const repository = process.env.ORBIT_API_REPOSITORY ? [process.env.ORBIT_API_REPOSITORY] : []
  const run = spawnSync(process.execPath, [generator, '--check', ...repository],
    { encoding: 'utf8', env: offlineEnvironment, timeout: 600000 })
  expect(run.error).toBeUndefined()
  expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0)
  expect(run.stdout).toContain(`catalog.yaml matches the exporter output at API ${apiCommit}.`)
}, 600000)

// Producer: credentials.mjs waitForHealthyApi reads the eval target's /health body, as the live run does. The preload
// code is a constant; the served commit reaches it as data in ASTRA_TEST_SERVED_COMMIT, never as code text.
const target = 'data:text/javascript,globalThis.fetch = async (url) => { if (String(url) !== '
  + "'https://eval-target.invalid/health') throw new Error('unexpected ' + url); return Response.json("
  + "{ status: 'Healthy', commit: process.env.ASTRA_TEST_SERVED_COMMIT, checks: [] }) }"
function checkAgainstTarget(servedCommit) {
  // A missing repository stops the check at its fetch, so a target check that lets the build start fails this test fast.
  const missingRepository = join(tmpdir(), 'astra-missing-api-repository')
  return spawnSync(process.execPath, ['--import', target, generator, '--check', missingRepository], {
    encoding: 'utf8',
    env: { ...offlineEnvironment, ORBIT_EVAL_BASE_URL: 'https://eval-target.invalid', ASTRA_TEST_SERVED_COMMIT: servedCommit },
    timeout: 60000,
  })
}

// Drift after the catalog's commit reaches the eval through the API that the eval target serves; the check refuses it
// with the live run's own message before it builds anything.
it('refuses an eval target that serves an API commit other than the one that the catalog names', () => {
  const servedCommit = 'b'.repeat(40)
  const run = checkAgainstTarget(servedCommit)
  expect(run.status).toBe(1)
  expect(run.stderr).toContain(`Astra catalog ${apiCommit} differs from API ${servedCommit}. Regenerate from a clean API `
    + 'checkout at that commit with node evals/astra/generate-catalog.mjs <api-checkout>.')
  expect(run.stderr).not.toContain('astra-missing-api-repository')
}, 60000)

it('goes on to the build at the catalog commit when the eval target serves that commit', () => {
  const run = checkAgainstTarget(apiCommit)
  expect(run.status).toBe(1)
  expect(run.stdout).toBe(`The eval target serves API ${apiCommit}.\n`)
  expect(run.stderr).not.toContain('differs from API')
  expect(run.stderr).toContain('astra-missing-api-repository')
}, 60000)

// Regeneration is the one command that repairs catalog.yaml, so it must not parse the committed file first. A scratch
// copy of the generator's modules gets a catalog with merge conflict markers, and an API directory with an untracked
// file stops the run at the generator's own clean checkout check, before any build.
it('regenerates past a committed catalog.yaml that does not parse', () => {
  const source = new URL('..', import.meta.url)
  const scratch = mkdtempSync(join(tmpdir(), 'astra-broken-catalog-'))
  const apiCheckout = mkdtempSync(join(tmpdir(), 'astra-dirty-api-'))
  try {
    for (const name of readdirSync(source)) {
      if (name.endsWith('.mjs')) copyFileSync(new URL(name, source), join(scratch, name))
    }
    symlinkSync(fileURLToPath(new URL('node_modules', source)), join(scratch, 'node_modules'), 'dir')
    writeFileSync(join(scratch, 'catalog.yaml'), `<<<<<<< HEAD\napiCommit: ${'a'.repeat(40)}\n=======\n`
      + `apiCommit: ${'b'.repeat(40)}\n>>>>>>> origin/main\n`)
    spawnSync('git', ['init', '--quiet', apiCheckout])
    writeFileSync(join(apiCheckout, 'untracked.txt'), 'untracked\n')
    const run = spawnSync(process.execPath, [join(scratch, 'generate-catalog.mjs'), apiCheckout],
      { encoding: 'utf8', env: offlineEnvironment, timeout: 60000 })
    expect(run.status, run.stderr).toBe(1)
    expect(run.stderr).not.toContain('YAMLParseError')
    expect(run.stderr).toContain('Catalog generation requires a clean API checkout.')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
    rmSync(apiCheckout, { recursive: true, force: true })
  }
})

// Producer: orbit-api PlanToolDeclaration.Name and ChangeDeclarations.WrapperName. The API declares these two with no
// registry entry: the plan of the block-first path, and the propose_changes wrapper of the ai_change_plan path. The second
// pair of names verifies that the exporter reads each name from its producer constant.
it.each([['present_plan', 'propose_changes'], ['producer_owned_plan', 'producer_owned_wrapper']])(
  'exports the unregistered producer declarations %s and %s and rejects other declarations', (planName, wrapperName) => {
  const exporter = readFileSync(new URL('../catalog-export.cs', import.meta.url), 'utf8')
  const entries = exporter.slice(exporter.indexOf('    return sdkCatalog.Keys'), exporter.indexOf('\n}\n\nstatic object? Property'))
  const property = exporter.match(/static object\? Property[^\n]+/)[0]
  const directory = mkdtempSync(join(tmpdir(), 'astra-plan-export-'))
  try {
    writeFileSync(join(directory, 'Export.csproj'), `<Project Sdk="Microsoft.NET.Sdk">
      <PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup>
    </Project>`)
    writeFileSync(join(directory, 'Program.cs'), `
using System.Reflection;
using System.Text.Json;
var registry = new Registry();
// Producer: AiIntentService.BuildToolCatalog and catalog-export.cs's SDK property reads.
var plan = new {
    FunctionName = PlanToolDeclaration.Name,
    FunctionDescription = "Publish the turn's plan alongside its first action calls. Does not execute account actions.",
    FunctionParameters = new BinaryData("{\\"type\\":\\"object\\",\\"properties\\":{\\"title\\":{\\"type\\":\\"string\\"}},\\"required\\":[\\"title\\"],\\"additionalProperties\\":false}"),
    StrictModeEnabled = (bool?)true
};
var wrapper = new {
    FunctionName = ChangeDeclarations.WrapperName,
    FunctionDescription = "Propose every account change of the request as one list.",
    FunctionParameters = new BinaryData("{\\"type\\":\\"object\\",\\"properties\\":{\\"changes\\":{\\"type\\":\\"array\\"}},\\"required\\":[\\"changes\\"],\\"additionalProperties\\":false}"),
    StrictModeEnabled = (bool?)true
};
var sdkCatalog = new Dictionary<string, object> { [plan.FunctionName] = plan, [wrapper.FunctionName] = wrapper };
var exported = JsonSerializer.SerializeToElement(Export());
if (exported.GetArrayLength() != 2) throw new Exception("A producer declaration was skipped.");
Check(exported[0], plan.FunctionName, plan.FunctionDescription, plan.FunctionParameters, writes: false);
Check(exported[1], wrapper.FunctionName, wrapper.FunctionDescription, wrapper.FunctionParameters, writes: true);
const string unknownName = "unknown_unregistered_declaration";
sdkCatalog = new Dictionary<string, object> { [unknownName] = new { FunctionName = unknownName } };
try
{
    Export();
    throw new Exception("An unknown declaration was accepted.");
}
catch (InvalidOperationException error) when (error.Message.Contains(unknownName, StringComparison.Ordinal)) { }
void Check(JsonElement entry, string name, string description, BinaryData parameters, bool writes)
{
    if (entry.GetProperty("type").GetString() != "function" || entry.GetProperty("writes").GetBoolean() != writes
        || entry.GetProperty("sensitiveFields").GetArrayLength() != 0)
        throw new Exception($"The write class or the sensitive fields of {name} changed.");
    var function = entry.GetProperty("function");
    if (function.GetProperty("name").GetString() != name
        || function.GetProperty("description").GetString() != description
        || function.GetProperty("strict").GetBoolean() != true
        || function.GetProperty("parameters").GetRawText() != parameters.ToString())
        throw new Exception($"The SDK-normalized function {name} changed.");
}
// Producer: catalog-export.cs SensitiveFields reads the registry entry of a tool.
string[] SensitiveFields(RegisteredTool tool) => throw new Exception("An unregistered declaration has no sensitive fields.");
object[] Export()
{
${entries}
}
${property}
// Producer: PlanToolDeclaration.Name and ChangeDeclarations.WrapperName.
public static class PlanToolDeclaration { public const string Name = ${JSON.stringify(planName)}; }
public static class ChangeDeclarations { public const string WrapperName = ${JSON.stringify(wrapperName)}; }
// Producer: AiToolRegistry.GetTool returns null when no tool is registered.
public sealed class Registry { public RegisteredTool? GetTool(string name) => null; }
public sealed class RegisteredTool
{
    public bool IsReadOnly => throw new Exception("An unregistered declaration has no registry metadata.");
}
public sealed class BinaryData(string value) { public override string ToString() => value; }
`)
    const run = spawnSync('dotnet', ['run', '--project', join(directory, 'Export.csproj')], {
      encoding: 'utf8', timeout: 45000,
    })
    expect(run.error).toBeUndefined()
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
