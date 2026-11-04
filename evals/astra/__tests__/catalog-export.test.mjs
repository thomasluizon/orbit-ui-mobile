import { expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

it('exports an empty pending store through both awaiting interfaces and rejects unstubbed calls', () => {
  const exporter = readFileSync(new URL('../catalog-export.cs', import.meta.url), 'utf8')
  const pending = exporter.match(/var pending = Boundary<IPendingAgentOperationStore>\.Create\([\s\S]*?\n\}\);/)[0]
  const boundary = exporter.slice(exporter.indexOf('public class Boundary<T>'), exporter.indexOf('public sealed class ToolConstruction'))
  const directory = mkdtempSync(join(tmpdir(), 'astra-pending-store-'))
  try {
    writeFileSync(join(directory, 'Pending.csproj'), `<Project Sdk="Microsoft.NET.Sdk">
      <PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup>
    </Project>`)
    writeFileSync(join(directory, 'Program.cs'), `
using System.Reflection;
${pending}
var awaiting = pending.GetAwaitingAsync(Guid.Empty, CancellationToken.None);
if (!awaiting.IsCompletedSuccessfully || (await awaiting).Count != 0)
    throw new Exception("Async pending operations must be empty and immediately available.");
if (pending.GetAwaiting(Guid.Empty).Count != 0)
    throw new Exception("Sync pending operations must be empty.");
if ((await pending.GetLastConversationPreviewsAsync(Guid.Empty, Guid.Empty)).Count != 0)
    throw new Exception("Conversation previews must be empty.");
try
{
    pending.GetPendingHabitCreations(Guid.Empty);
    throw new Exception("An unstubbed call was accepted.");
}
catch (InvalidOperationException error) when (error.Message == "GetPendingHabitCreations") { }
${boundary}
// Producer: orbit-api src/Orbit.Domain/Interfaces/IAgentPlatformServices.cs:56-64.
public interface IPendingAgentOperationStore
{
    Task<IReadOnlyList<PendingAgentOperationPreview>> GetLastConversationPreviewsAsync(
        Guid userId, Guid conversationId, CancellationToken cancellationToken = default);
    IReadOnlyList<PendingHabitCreation> GetPendingHabitCreations(Guid userId);
    IReadOnlyList<PendingAgentOperationExecution> GetAwaiting(Guid userId);
    Task<IReadOnlyList<PendingAgentOperationExecution>> GetAwaitingAsync(Guid userId, CancellationToken cancellationToken = default);
}
public sealed class PendingAgentOperationPreview { }
public sealed class PendingHabitCreation { }
public sealed class PendingAgentOperationExecution { }
`)
    const run = spawnSync('dotnet', ['run', '--project', join(directory, 'Pending.csproj')], {
      encoding: 'utf8', timeout: 45000,
    })
    expect(run.error).toBeUndefined()
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

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
