param(
  [string]$Output = "dist"
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
$outDir = Join-Path $root $Output

if (Test-Path $outDir) {
  Remove-Item -Recurse -Force $outDir
}

New-Item -ItemType Directory -Force $outDir | Out-Null

Copy-Item -Path (Join-Path $root "index.html") -Destination (Join-Path $outDir "index.html") -Force
Copy-Item -Path (Join-Path $root "frontend") -Destination (Join-Path $outDir "frontend") -Recurse -Force

Write-Host "Build completado en: $outDir"