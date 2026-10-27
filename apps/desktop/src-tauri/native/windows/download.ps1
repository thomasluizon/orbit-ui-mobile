function Get-VerifiedDownload([string]$Url, [string]$Destination, [string]$Sha256) {
    $partial = "$Destination.partial"
    New-Item -ItemType Directory -Path (Split-Path $Destination -Parent) -Force | Out-Null
    Remove-Item $partial -Force -ErrorAction SilentlyContinue
    if (Test-Path $Destination) {
        if ((Get-FileHash $Destination -Algorithm SHA256).Hash -eq $Sha256) { return $Destination }
        Remove-Item $Destination -Force
    }
    $delays = @(2, 4, 8)
    for ($attempt = 1; $attempt -le 4; $attempt++) {
        try {
            Invoke-WebRequest $Url -OutFile $partial -UseBasicParsing -TimeoutSec 120
            if ((Get-FileHash $partial -Algorithm SHA256).Hash -ne $Sha256) {
                throw "SHA-256 mismatch for $Url"
            }
            Move-Item $partial $Destination -Force
            return $Destination
        } catch {
            Remove-Item $partial -Force -ErrorAction SilentlyContinue
            if ($attempt -eq 4) { throw "Download failed after 4 attempts for ${Url}: $($_.Exception.Message)" }
            Write-Warning "Download attempt $attempt failed for ${Url}: $($_.Exception.Message)"
            Start-Sleep -Seconds $delays[$attempt - 1]
        }
    }
}
