# Simula o gateway dos embedded tools para testar o HTML em DATA_MODE = 'live':
# serve o dashboard e responde /__octodone/session e POST /__octodone/graphql.
#   powershell -NoProfile -ExecutionPolicy Bypass -File .claude\mock-gateway.ps1 -File painel.html [-Mode ok|expired|error|empty|slow]
#
# Respostas do GraphQL, em ordem de prioridade:
#   1. .claude\mock-answer.ps1 — se existir, é carregado e deve definir  function Answer($q) { ... }  que devolve
#      o JSON (string) da resposta. Use quando o teste precisa de paginação/lotes reais
#      (exemplo completo: assets\reference-mock-answer.ps1 da skill, do Time Tracker).
#   2. .claude\fixtures\<Entidade>.json — resposta completa {"data":{...}} para a entidade raiz da query
#      (ex.: query { TaskWorkSession { ... } } -> fixtures\TaskWorkSession.json). Dados reais obtidos pelo MCP.
# Modos: expired = 401 em tudo; error = 500 no GraphQL; empty = listas vazias; slow = +1,5 s por resposta.
param([string]$File = 'index.html', [int]$Port = 8767, [ValidateSet('ok', 'expired', 'error', 'empty', 'slow')][string]$Mode = 'ok')
$here = $PSScriptRoot; $root = Split-Path -Parent $here
$utf8 = New-Object Text.UTF8Encoding($false)
$custom = Join-Path $here 'mock-answer.ps1'
if (Test-Path $custom) { . $custom }
function Fixture($q) {
  if ($q -notmatch '\{\s*(\w+)\s*\{') { return '{"errors":[{"message":"mock: consulta sem entidade raiz"}]}' }
  $f = Join-Path $here ("fixtures\" + $Matches[1] + '.json')
  if (-not (Test-Path $f)) { return '{"errors":[{"message":"mock: sem fixture para ' + $Matches[1] + '"}]}' }
  [IO.File]::ReadAllText($f, $utf8)
}
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Mock gateway on http://localhost:$Port/ (modo $Mode, raiz -> $File)"
while ($l.IsListening) {
  $c = $l.GetContext(); $req = $c.Request; $res = $c.Response
  try {
    $path = $req.Url.AbsolutePath
    if ($Mode -eq 'slow' -and $path -like '/__octodone/*') { Start-Sleep -Milliseconds 1500 }
    $res.ContentType = 'application/json'
    if ($path -like '/__octodone/*' -and $req.Headers['X-Octodone-Embed'] -ne '1') {
      $res.StatusCode = 403; $out = '{"detail":"Embedded API requests require the bridge header and same origin"}'
    } elseif ($path -like '/__octodone/*' -and $Mode -eq 'expired') {
      $res.StatusCode = 401; $out = '{"detail":"Embedded session expired"}'
    } elseif ($path -eq '/__octodone/session') {
      $out = '{"user_id":987,"company_id":1,"menu_id":0}'
    } elseif ($path -eq '/__octodone/graphql') {
      if ($Mode -eq 'error') { $res.StatusCode = 500; $out = '{"detail":"mock: erro interno"}' }
      else {
        $body = (New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)).ReadToEnd()
        $q = ($body | ConvertFrom-Json).query
        $out = if (Get-Command Answer -ErrorAction SilentlyContinue) { Answer $q } else { Fixture $q }
        if ($Mode -eq 'empty') { $out = $out -replace '"totalCount":\d+', '"totalCount":0' -replace '"items":\[[\s\S]*\]', '"items":[]' }
        Write-Host ("{0} {1}" -f (Get-Date -Format HH:mm:ss), $q.Substring(0, [Math]::Min(110, $q.Length)))
      }
    } else {
      $p = [Uri]::UnescapeDataString($path.TrimStart('/')); if (-not $p) { $p = $File }
      $f = Join-Path $root $p
      if (Test-Path $f -PathType Leaf) { $out = [IO.File]::ReadAllText($f, $utf8); $res.ContentType = 'text/html; charset=utf-8' }
      else { $res.StatusCode = 404; $out = '' }
    }
    $b = [Text.Encoding]::UTF8.GetBytes($out); $res.OutputStream.Write($b, 0, $b.Length)
  } catch { $res.StatusCode = 500; Write-Host "ERR $_" }
  $res.Close()
}
