param([Parameter(Mandatory)][ValidateSet('x64', 'arm64')][string]$Architecture, [Parameter(Mandatory)][string]$Output)
$ErrorActionPreference = 'Stop'

function Expand-Nuget([string]$Id, [string]$Version, [string]$Destination) {
    if (Test-Path $Destination) { return }
    $archive = Join-Path $Output "$Id.zip"
    Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/$Id/$Version/$Id.$Version.nupkg" -OutFile $archive
    Expand-Archive $archive $Destination
    Remove-Item $archive
}

Expand-Nuget 'microsoft.windowsappsdk' '1.7.260224002' (Join-Path $Output 'sdk')
Expand-Nuget 'microsoft.windows.cppwinrt' '2.0.250303.1' (Join-Path $Output 'cppwinrt')
$projection = Join-Path $Output 'projection'
$metadata = Join-Path $Output 'sdk/lib/uap10.0'
& (Join-Path $Output 'cppwinrt/bin/cppwinrt.exe') -input (Join-Path $metadata 'Microsoft.Windows.PushNotifications.winmd') (Join-Path $metadata 'Microsoft.Windows.AppNotifications.winmd') (Join-Path $metadata 'Microsoft.Windows.AppNotifications.Builder.winmd') -reference sdk (Join-Path $Output 'sdk/lib') -output $projection
if ($LASTEXITCODE -ne 0) { throw 'C++/WinRT projection failed' }
$installer = Join-Path $Output 'WindowsAppRuntimeInstall.exe'
if (!(Test-Path $installer)) {
    Invoke-WebRequest "https://aka.ms/windowsappsdk/1.7/1.7.260224002/windowsappruntimeinstall-$Architecture.exe" -OutFile $installer
}
foreach ($signedFile in @($installer, (Join-Path $Output "sdk/runtimes/win-$Architecture/native/Microsoft.WindowsAppRuntime.Bootstrap.dll"))) {
    $signature = Get-AuthenticodeSignature $signedFile
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation,') {
        throw 'Windows App SDK signature verification failed'
    }
}
