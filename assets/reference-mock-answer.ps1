# Exemplo REAL de mock-answer.ps1 (Time Tracker): copie para .claude\mock-answer.ps1 e adapte.
# Lê uma amostra local e responde às queries respeitando perPage/page/período e os lotes por ids.
# É carregado pelo mock-gateway.ps1 (que já cria o listener); aqui fica só o Answer($q).
$root = Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName System.Web.Extensions
$ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$ser.MaxJsonLength = [int]::MaxValue
$data = $ser.DeserializeObject([IO.File]::ReadAllText("$env:TEMP\tt\data.json", [Text.Encoding]::UTF8))
$users = @{}; foreach ($u in $data['users']) { $users[[int]$u[0]] = $u }
$dels = @{}; foreach ($d in $data['dels']) { $dels[[int]$d[0]] = $d }
$sess = $data['s'] | Where-Object { -not $_[5] } | Sort-Object { $_[3] } -Descending
$epoch = [DateTimeOffset]::new(1970, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
function J($v) { if ($v -eq $null) { 'null' } else { $ser.Serialize($v) } }
function Ids($q) { if ($q -match '(?:userIds|deliverableIds): \[([\d,]*)\]') { $Matches[1].Split(',') | Where-Object { $_ } | ForEach-Object { [int]$_ } } }
$cache = @{}
function Answer($q) {
  if ($q -match 'TaskWorkSession') {
    $null = $q -match 'perPage: (\d+), page: (\d+), startDate: "([^"]+)", endDate: "([^"]+)"'
    $per = [int]$Matches[1]; $pg = [int]$Matches[2]
    $a = [int64]([DateTimeOffset]::Parse($Matches[3] + 'Z') - $epoch).TotalSeconds; $b = [int64]([DateTimeOffset]::Parse($Matches[4] + 'Z') - $epoch).TotalSeconds
    $k = "$a|$b"; if (-not $cache[$k]) { $cache[$k] = @($sess | Where-Object { $_[3] -ge $a -and $_[3] -le $b }) }
    $all = $cache[$k]; $page = $all | Select-Object -Skip (($pg - 1) * $per) -First $per
    $items = ($page | ForEach-Object { '{"id":' + $_[0] + ',"userId":' + $_[1] + ',"deliverableId":' + $(if ($_[2]) { $_[2] } else { 'null' }) + ',"startDate":"' + $epoch.AddSeconds($_[3]).ToString("yyyy-MM-ddTHH:mm:ss+00:00") + '","duration":' + $_[4] + ',"deletedAt":null}' }) -join ','
    return '{"data":{"TaskWorkSession":{"all":{"totalCount":' + $all.Count + ',"items":[' + $items + ']}}}}'
  }
  if ($q -match 'User \{') {
    $items = (Ids $q | Where-Object { $users.ContainsKey($_) } | ForEach-Object { $u = $users[$_]
      '{"id":' + $u[0] + ',"fullname":' + (J $u[1]) + ',"username":' + (J $u[2]) + ',"email":' + (J $u[3]) + ',"deletedAt":' + $(if ($u[5]) { '"x"' } else { 'null' }) + ',"userRank":{"career":' + $(if ($u[6]) { '{"name":' + (J $u[6]) + ',"area":' + $(if ($u[4]) { '{"name":' + (J $u[4]) + '}' } else { 'null' }) + '}' } else { 'null' }) + '}}' }) -join ','
    return '{"data":{"User":{"all":{"items":[' + $items + ']}}}}'
  }
  if ($q -match 'Deliverable \{') {
    $items = (Ids $q | Where-Object { $dels.ContainsKey($_) } | ForEach-Object { $d = $dels[$_]
      '{"id":' + $d[0] + ',"name":' + (J $d[1]) + ',"jobQuote":' + $(if ($d[2] -ne $null) { '{"job":{"jobNumber":' + (J $d[2]) + '}}' } else { 'null' }) + '}' }) -join ','
    return '{"data":{"Deliverable":{"all":{"items":[' + $items + ']}}}}'
  }
  return '{"errors":[{"message":"mock: consulta desconhecida"}]}'
}
