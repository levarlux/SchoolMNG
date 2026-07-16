# Local release helper
# Usage: .\scripts\release.ps1 -Tag "v0.2.0-preview.1"
param(
    [Parameter(Mandatory=$true)]
    [string]$Tag
)

$version = $Tag -replace '^v', ''
$bundleDir = "src-tauri/target/x86_64-pc-windows-msvc/release/bundle"

# Find NSIS installer and sig
$nsis = Get-ChildItem -Path "$bundleDir/nsis" -Filter "*.exe" | Select-Object -First 1
$nsisSig = Get-ChildItem -Path "$bundleDir/nsis" -Filter "*.sig" | Select-Object -First 1

# Find MSI and sig
$msi = Get-ChildItem -Path "$bundleDir/msi" -Filter "*.msi" | Select-Object -First 1
$msiSig = Get-ChildItem -Path "$bundleDir/msi" -Filter "*.sig" | Select-Object -First 1

if (-not $nsis) {
    Write-Host "No NSIS installer found in $bundleDir/nsis" -ForegroundColor Red
    Write-Host "Run 'npx tauri build' first" -ForegroundColor Yellow
    exit 1
}

Write-Host "Building latest.json for $Tag" -ForegroundColor Cyan
Write-Host "  NSIS: $($nsis.Name)" -ForegroundColor Gray
Write-Host "  MSI:  $($msi.Name)" -ForegroundColor Gray

$nsisSigContent = if ($nsisSig) { Get-Content $nsisSig.FullName -Raw } else { "" }
$msiSigContent = if ($msiSig) { Get-Content $msiSig.FullName -Raw } else { "" }

$latest = @{
    version = $version
    notes = "SchoolMNG $Tag"
    pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = @{
        "windows-x86_64" = @{
            signature = $nsisSigContent.Trim()
            url = "https://github.com/levarlux/SchoolMNG/releases/download/$Tag/$($nsis.Name)"
        }
        "windows-x86_64-msi" = @{
            signature = $msiSigContent.Trim()
            url = "https://github.com/levarlux/SchoolMNG/releases/download/$Tag/$($msi.Name)"
        }
    }
}

$latest | ConvertTo-Json -Depth 10 | Set-Content -Path "latest.json" -Encoding UTF8
Write-Host "Generated latest.json" -ForegroundColor Green
Get-Content latest.json

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Create a GitHub release with tag $Tag" -ForegroundColor Gray
Write-Host "  2. Upload: $($nsis.Name)" -ForegroundColor Gray
Write-Host "  3. Upload: $($nsisSig.Name)" -ForegroundColor Gray
Write-Host "  4. Upload: $($msi.Name)" -ForegroundColor Gray
Write-Host "  5. Upload: $($msiSig.Name)" -ForegroundColor Gray
Write-Host "  6. Upload: latest.json" -ForegroundColor Gray
