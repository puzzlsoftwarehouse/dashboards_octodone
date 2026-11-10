# Gera o HTML final autocontido a partir da fonte de edição.
#   powershell -NoProfile -ExecutionPolicy Bypass -File .claude\build.ps1 -Src src\painel.src.html -Out painel.html
# Troca <!-- @@VENDOR@@ --> pelo bloco embutido (fonte Inter base64 + Chart.js 4.4.1 + SheetJS 0.18.5)
# e recusa gerar se sobrar placeholder {{...}} ou se DATA_MODE não for 'dev' e ainda houver amostra em DEV_DATA.
param(
  [Parameter(Mandatory = $true)][string]$Src,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Vendor = (Join-Path $PSScriptRoot 'vendor.html')
)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object Text.UTF8Encoding($false)
$html = [IO.File]::ReadAllText((Resolve-Path $Src), $utf8)
if (-not (Test-Path $Vendor)) { throw "vendor.html não encontrado em $Vendor (copie de assets/ da skill)." }
if ($html -notmatch '<!-- @@VENDOR@@ -->') { throw 'Marcador <!-- @@VENDOR@@ --> não encontrado na fonte.' }
$left = [regex]::Matches($html, '\{\{[^}]+\}\}') | ForEach-Object { $_.Value } | Select-Object -Unique
if ($left) { throw ('Placeholders sem preencher: ' + ($left -join ', ')) }
$mode = if ($html -match "const DATA_MODE = '(\w+)'") { $Matches[1] } else { throw 'DATA_MODE não encontrado.' }
if ($mode -ne 'dev' -and $html -match 'items:\s*\[\s*\{') { throw "DATA_MODE = '$mode' mas DEV_DATA ainda tem amostra. Esvazie items/lookups antes do build final." }
$vendor = [IO.File]::ReadAllText((Resolve-Path $Vendor), $utf8)
$out = $html.Replace('<!-- @@VENDOR@@ -->', $vendor)
$outPath = if ([IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path (Get-Location) $Out }
[IO.File]::WriteAllText($outPath, $out, $utf8)
Write-Host ("OK: {0} ({1:N0} KB, DATA_MODE={2})" -f $outPath, ((Get-Item $outPath).Length / 1KB), $mode)
