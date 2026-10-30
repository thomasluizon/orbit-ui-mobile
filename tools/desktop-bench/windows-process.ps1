$ErrorActionPreference = 'Stop'
$processSchema = Get-CimClass -ClassName Win32_Process
foreach ($field in @('ProcessId', 'ParentProcessId', 'WorkingSetSize', 'KernelModeTime', 'UserModeTime', 'Name')) {
    if (-not $processSchema.CimClassProperties[$field]) { throw "Missing Win32_Process field: $field" }
}
$rows = @(Get-CimInstance -ClassName Win32_Process | ForEach-Object {
    [ordered]@{
        pid = [int]$_.ProcessId
        parent = [int]$_.ParentProcessId
        residentBytes = [double]$_.WorkingSetSize
        cpuSeconds = ([double]$_.KernelModeTime + [double]$_.UserModeTime) / 10000000
        command = [string]$_.Name
    }
})
ConvertTo-Json -InputObject $rows -Compress
