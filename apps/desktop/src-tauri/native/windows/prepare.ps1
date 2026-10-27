param([Parameter(Mandatory)][ValidateSet('x64', 'arm64')][string]$Architecture, [Parameter(Mandatory)][string]$Output)
$ErrorActionPreference = 'Stop'

$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'download.ps1')
$downloads = Get-Content (Join-Path $PSScriptRoot 'downloads.json') -Raw | ConvertFrom-Json
$cache = $env:ORBIT_WINDOWS_DOWNLOAD_CACHE
if (!$cache) { $cache = Join-Path $Output 'downloads' }

function Expand-Nuget([string]$Name, [string]$Destination) {
    $package = $downloads.$Name
    $archive = Get-VerifiedDownload $package.url (Join-Path $cache "$Name.zip") $package.sha256
    if (Test-Path $Destination) { return }
    $expansion = "$Destination.partial"
    if (Test-Path $expansion) { Remove-Item $expansion -Recurse -Force }
    Expand-Archive $archive $expansion
    Move-Item $expansion $Destination
}

Expand-Nuget 'sdk' (Join-Path $Output 'sdk')
Expand-Nuget 'cppwinrt' (Join-Path $Output 'cppwinrt')
$projection = Join-Path $Output 'projection'
$metadata = Join-Path $Output 'sdk/lib/uap10.0'
& (Join-Path $Output 'cppwinrt/bin/cppwinrt.exe') -input sdk (Join-Path $metadata 'Microsoft.Windows.PushNotifications.winmd') (Join-Path $metadata 'Microsoft.Windows.AppNotifications.winmd') (Join-Path $metadata 'Microsoft.Windows.AppNotifications.Builder.winmd') -reference (Join-Path $Output 'sdk/lib') -base -output $projection
if ($LASTEXITCODE -ne 0) { throw 'C++/WinRT projection failed' }
foreach ($header in @('base.h', 'Windows.Foundation.h', 'Windows.Foundation.Collections.h', 'Microsoft.Windows.PushNotifications.h')) {
    if (!(Test-Path (Join-Path $projection "winrt/$header"))) { throw "Missing generated C++/WinRT header: $header" }
}
$installer = Join-Path $Output 'WindowsAppRuntimeInstall.exe'
$runtime = $downloads."runtime-$Architecture"
$cachedInstaller = Get-VerifiedDownload $runtime.url (Join-Path $cache "runtime-$Architecture.exe") $runtime.sha256
Copy-Item $cachedInstaller $installer -Force
foreach ($signedFile in @($installer, (Join-Path $Output "sdk/runtimes/win-$Architecture/native/Microsoft.WindowsAppRuntime.Bootstrap.dll"))) {
    $signature = Get-AuthenticodeSignature $signedFile
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation,') {
        throw 'Windows App SDK signature verification failed'
    }
}
