param(
    [Parameter(Mandatory = $true)][ValidateSet('start', 'run', 'info', 'remove')][string]$Mode,
    [string]$Executable,
    [string]$Log,
    [string]$Output,
    [string]$Status,
    [string]$Task
)
$ErrorActionPreference = 'Stop'

# App notifications are unsupported in an elevated process, so the installed shell starts from a limited-token
# scheduled task in the signed-in session, the way a person's launch runs.
function Get-LaunchContext {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    [ordered]@{ user = $identity.Name; elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }
}

function Write-Status($Entry) {
    [IO.File]::AppendAllText($Status, (($Entry | ConvertTo-Json -Compress) + "`n"), [Text.UTF8Encoding]::new($false))
}

switch ($Mode) {
    'run' {
        $context = Get-LaunchContext
        Write-Status ([ordered]@{ kind = 'context'; user = $context.user; elevated = $context.elevated })
        try {
            $process = Start-Process -FilePath $Executable -WorkingDirectory (Split-Path -Parent $Executable) -PassThru `
                -RedirectStandardError $Log -RedirectStandardOutput $Output
            # WHY: Process.ExitCode stays empty after Start-Process -PassThru unless the process handle is opened first.
            $null = $process.Handle
            Write-Status ([ordered]@{ kind = 'launch'; pid = $process.Id })
            $process.WaitForExit()
            Write-Status ([ordered]@{ kind = 'exit'; code = $process.ExitCode })
        } catch {
            Write-Status ([ordered]@{ kind = 'error'; message = $_.Exception.Message })
            throw
        }
    }
    'start' {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        # The limited token keeps the user SID, so an inherited grant to that SID lets the shell read its files and write its logs.
        & icacls.exe (Split-Path -Parent $Status) /grant "*$($identity.User.Value):(OI)(CI)M" /Q | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "icacls could not grant the acceptance output to $($identity.Name)" }
        $arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}" -Mode run -Executable "{1}" -Log "{2}" -Output "{3}" -Status "{4}"' -f `
            $PSCommandPath, $Executable, $Log, $Output, $Status
        $action = New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') -Argument $arguments
        $principal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances Parallel
        Register-ScheduledTask -TaskName $Task -Action $action -Principal $principal -Settings $settings -Force | Out-Null
        Start-ScheduledTask -TaskName $Task
        Get-LaunchContext | ConvertTo-Json -Compress
    }
    'info' {
        $info = Get-ScheduledTaskInfo -TaskName $Task
        [ordered]@{ state = "$((Get-ScheduledTask -TaskName $Task).State)"; lastTaskResult = $info.LastTaskResult; lastRunTime = "$($info.LastRunTime)" } |
            ConvertTo-Json -Compress
    }
    'remove' { Unregister-ScheduledTask -TaskName $Task -Confirm:$false }
}
