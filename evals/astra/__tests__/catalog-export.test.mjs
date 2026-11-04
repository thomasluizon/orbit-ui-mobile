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
