param([Parameter(Mandatory = $true)][string]$Executable, [Parameter(Mandatory = $true)][string]$ShellLog)
$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'windows-job.cs')
$job = [BenchmarkJob]::new()
try {
    while ($null -ne ($command = [Console]::ReadLine())) {
        switch ($command) {
            'launch' { $reply = @{ kind = 'launch'; epochMs = $job.Launch($Executable, $ShellLog) } }
            'sample' { $reply = $job.Read() }
            'stop' { $job.Stop(); [Console]::WriteLine('{"kind":"stop"}'); exit 0 }
            default { throw "Unknown accounting command: $command" }
        }
        [Console]::WriteLine(($reply | ConvertTo-Json -Depth 6 -Compress))
    }
} finally { $job.Dispose() }
