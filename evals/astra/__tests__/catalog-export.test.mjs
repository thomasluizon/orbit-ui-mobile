import { expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

// The exporter must build and run against the real API, not a hand-written copy of its interfaces: API drift that breaks
// the exporter or changes its output fails here. ORBIT_API_REPOSITORY names a local orbit-api repository to fetch the
// catalog's commit from; the default is the public GitHub repository.
it('builds and runs the exporter against the API commit that the catalog names and reproduces the catalog', () => {
  const { apiCommit } = parse(readFileSync(new URL('../catalog.yaml', import.meta.url), 'utf8'))
  const repository = process.env.ORBIT_API_REPOSITORY ? [process.env.ORBIT_API_REPOSITORY] : []
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('../generate-catalog.mjs', import.meta.url)), '--check',
    ...repository], { encoding: 'utf8', timeout: 600000 })
  expect(run.error).toBeUndefined()
  expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0)
  expect(run.stdout).toContain(`catalog.yaml matches the exporter output at API ${apiCommit}.`)
}, 600000)

it.each(['present_plan', 'producer_owned_plan'])('exports the unregistered producer plan %s and rejects other declarations', (planName) => {
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
var collectSensitiveFields = typeof(RegisteredTool).GetMethod("CollectSensitiveFields")!;
// Producer: AiIntentService.BuildToolCatalog and catalog-export.cs's SDK property reads.
var sdk = new {
    FunctionName = PlanToolDeclaration.Name,
    FunctionDescription = "Publish the turn's plan alongside its first action calls. Does not execute account actions.",
    FunctionParameters = new BinaryData("{\\"type\\":\\"object\\",\\"properties\\":{\\"title\\":{\\"type\\":\\"string\\"}},\\"required\\":[\\"title\\"],\\"additionalProperties\\":false}"),
    StrictModeEnabled = (bool?)true
};
var sdkCatalog = new Dictionary<string, object> { [sdk.FunctionName] = sdk };
var exported = JsonSerializer.SerializeToElement(Export());
if (exported.GetArrayLength() != 1) throw new Exception("The plan declaration was skipped.");
var plan = exported[0];
if (plan.GetProperty("type").GetString() != "function" || plan.GetProperty("writes").GetBoolean()
    || plan.GetProperty("sensitiveFields").GetArrayLength() != 0)
    throw new Exception("The plan must be read only with no registry sensitivity fields.");
var function = plan.GetProperty("function");
if (function.GetProperty("name").GetString() != sdk.FunctionName
    || function.GetProperty("description").GetString() != sdk.FunctionDescription
    || function.GetProperty("strict").GetBoolean() != sdk.StrictModeEnabled
    || function.GetProperty("parameters").GetRawText() != sdk.FunctionParameters.ToString())
    throw new Exception("The SDK-normalized function changed.");
const string unknownName = "unknown_unregistered_declaration";
sdkCatalog = new Dictionary<string, object> { [unknownName] = new { FunctionName = unknownName } };
try
{
    Export();
    throw new Exception("An unknown declaration was accepted.");
}
catch (InvalidOperationException error) when (error.Message.Contains(unknownName, StringComparison.Ordinal)) { }
object[] Export()
{
${entries}
}
${property}
// Producer: PlanToolDeclaration.Name; the alternate value verifies producer ownership.
public static class PlanToolDeclaration { public const string Name = ${JSON.stringify(planName)}; }
// Producer: AiToolRegistry.GetTool returns null when no tool is registered.
public sealed class Registry { public RegisteredTool? GetTool(string name) => null; }
public sealed class RegisteredTool
{
    public bool IsReadOnly => throw new Exception("An unregistered plan has no registry metadata.");
    public object GetParameterSchema() => throw new Exception("An unregistered plan has no parameter schema.");
    public object? GetResultSchema() => throw new Exception("An unregistered plan has no result schema.");
    public static void CollectSensitiveFields(JsonElement schema, ISet<string> fields) =>
        throw new Exception("An unregistered plan has no schema-declared sensitive fields.");
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
