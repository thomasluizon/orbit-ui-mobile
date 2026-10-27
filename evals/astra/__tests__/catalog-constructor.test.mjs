import { expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

it('constructs by parameter name and reports every unknown parameter before invoking the constructor', () => {
  const directory = mkdtempSync(join(tmpdir(), 'astra-constructor-'))
  const source = fileURLToPath(new URL('../catalog-constructor.cs', import.meta.url))
    .replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
  try {
    writeFileSync(join(directory, 'Constructor.csproj'), `<Project Sdk="Microsoft.NET.Sdk">
      <PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup>
      <ItemGroup><Compile Include="${source}" Link="CatalogConstructor.cs" /></ItemGroup>
    </Project>`)
    writeFileSync(join(directory, 'Program.cs'), `
var values = new Dictionary<string, object?> { ["Enabled"] = true, ["Text"] = "known", ["Removed"] = 42 };
try
{
    CatalogConstructor.Create(typeof(UnknownContext), values);
    throw new Exception("Unknown constructor parameters were accepted.");
}
catch (InvalidOperationException error) when (
    error.Message.Contains("UnknownContext") && error.Message.Contains("NewValue") && error.Message.Contains("OtherValue")) { }
var current = (CurrentContext)CatalogConstructor.Create(typeof(CurrentContext), values);
if (current.Text != "known" || !current.Enabled) throw new Exception("Constructor values did not follow parameter names.");
var previous = (PreviousContext)CatalogConstructor.Create(typeof(PreviousContext), values);
if (previous.Removed != 42 || previous.Text != "known" || !previous.Enabled) throw new Exception("Known parameters changed.");
public sealed record CurrentContext(string Text, bool Enabled);
public sealed record PreviousContext(int Removed, string Text, bool Enabled);
public sealed class UnknownContext
{
    public UnknownContext(string Text, string NewValue, bool OtherValue) =>
        throw new Exception("The constructor ran before checking unknown parameters.");
}
`)
    const run = spawnSync('dotnet', ['run', '--project', join(directory, 'Constructor.csproj')], {
      encoding: 'utf8', timeout: 45000,
    })
    expect(run.error).toBeUndefined()
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
