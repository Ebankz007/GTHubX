# GTHubX Phase 7e live smoke: the in-app notification feed is non-empty.
#
# The claim: the Notification writer (Phase 7e) actually writes rows and the
# member feed renders them. The register→verify-email path now writes an
# in-app "Verify your email" notification; this harness proves the feed is not
# stuck on the empty state.
$ErrorActionPreference = "Continue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$port = 3500
$tmp = "C:\Users\PC\AppData\Local\Temp\opencode"
$transcript = "$tmp\gthubx-phase7e-results.txt"
$outLog = "$tmp\gthubx-phase7e-dev.out.log"
$errLog = "$tmp\gthubx-phase7e-dev.err.log"
$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
Set-Content -LiteralPath $transcript -Value "==== PHASE 7e SMOKE $(Get-Date -Format s) ====" -Encoding UTF8
$script:pass = 0; $script:fail = 0

function Check($name, $ok, $detail) {
  if ($ok) { $script:pass++ } else { $script:fail++ }
  $line = "[{0}] {1} :: {2}" -f $(if ($ok) { "PASS" } else { "FAIL" }), $name, $detail
  Write-Host $line; Add-Content -LiteralPath $transcript -Value $line
}
function NonEmpty($s) { return ($s -ne $null -and "$s" -ne "") }
function C-Status($method, $url, $jar, $bodyFile, $out = "$tmp\last7e.txt", $extraHeaders = @()) {
  $a = @("-s","-o",$out,"-w","%{http_code}","--max-redirs","0","--max-time","60","-X",$method,$url)
  if ($jar) { $a += @("-b",$jar,"-c",$jar) }
  if ($bodyFile) { $a += @("-H","Content-Type: application/json","--data-binary","@$bodyFile") }
  foreach ($h in $extraHeaders) { $a += @("-H",$h) }
  return (& curl.exe @a 2>$null)
}
function Json($obj, $name) {
  $f = "$tmp\b7e-$name-$([guid]::NewGuid().ToString('N').Substring(0,6)).json"
  $obj | ConvertTo-Json -Compress | Set-Content -LiteralPath $f -Encoding UTF8
  return $f
}
function Sql($query) {
  $f = "$tmp\q7e-$([guid]::NewGuid().ToString('N').Substring(0,8)).sql"
  Set-Content -LiteralPath $f -Value $query -Encoding ASCII
  $r = & $psql -X -v ON_ERROR_STOP=1 -t -A -f $f $script:dbUrl 2>&1
  $code = $LASTEXITCODE
  Remove-Item $f -ErrorAction SilentlyContinue
  if ($code -ne 0) { Write-Host "SQL ERROR($code): $r"; Add-Content $transcript "SQL ERROR($code): $r" }
  return (($r | Out-String).Trim())
}
function Free-Port([int]$p) {
  $conns = netstat -ano | Select-String ":$p\s+.*LISTENING"
  if (-not $conns) { return $true }
  foreach ($procId in ($conns | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique)) {
    try { Stop-Process -Id ([int]$procId) -Force -ErrorAction Stop } catch { }
  }
  Start-Sleep -Seconds 2
  return -not (netstat -ano | Select-String ":$p\s+.*LISTENING")
}
function Body($path) { return (Get-Content $path -Raw -ErrorAction SilentlyContinue) }
function Log-Text {
  $o = Get-Content -LiteralPath $outLog -Raw -ErrorAction SilentlyContinue
  $e = Get-Content -LiteralPath $errLog -Raw -ErrorAction SilentlyContinue
  return ("$o`n$e")
}
function Wait-Log([string]$pattern, [int]$seconds = 20) {
  for ($i = 0; $i -lt $seconds; $i++) {
    $m = [regex]::Match((Log-Text), $pattern)
    if ($m.Success) { return $m.Value }
    Start-Sleep -Seconds 1
  }
  return $null
}
function Url-Token([string]$pattern) {
  $m = [regex]::Match((Log-Text), $pattern)
  if (-not $m.Success) { return $null }
  return ($m.Value -split 'token=')[1]
}

$envLine = (Select-String -Path "$root\.env" -Pattern '^DATABASE_URL=' | Select-Object -First 1).Line
$script:dbUrl = (($envLine -replace '^DATABASE_URL=', '').Trim().Trim('"') -split '\?')[0]
$stamp = (Get-Date -Format 'HHmmss') + (Get-Random -Minimum 100 -Maximum 999)
$email = "notifier-$stamp@p7e-fixture.test"
$memberPass = "Original-Pass-1234"

Push-Location $root
if (-not (Free-Port $port)) { Add-Content $transcript "PORT NOT FREE"; Pop-Location; exit 1 }
$proc = $null
try {
  $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "pnpm exec next dev -p $port" `
    -WorkingDirectory $root -RedirectStandardOutput $outLog -RedirectStandardError $errLog `
    -WindowStyle Hidden -PassThru
  $ready = 0
  for ($i = 0; $i -lt 150; $i++) {
    Start-Sleep -Seconds 1
    if ((C-Status "GET" "http://localhost:$port/" $null $null) -eq 200) { $ready = $i + 1; break }
  }
  Check "cold start renders GET / -> 200" ($ready -gt 0) "after $ready s"
  if (-not $ready) { Get-Content $errLog -EA SilentlyContinue | Select-Object -Last 30; throw "app never came up" }
  $base = "http://localhost:$port"

  $bReg = Json @{ fullName="Phase Seven Notifier"; email=$email; password=$memberPass; country="PH" } "reg"
  Check "register -> 201" ((C-Status "POST" "$base/api/auth/register" $null $bReg) -eq 201) ""
  Check "activation email composed" ((Wait-Log ('\[email:dev\] to=' + [regex]::Escape($email)) 20) -ne $null) ""
  $verifyToken = Url-Token 'https?://[^\s"]*/verify-email\?token=[A-Za-z0-9_\-]+'
  $bVerify = Json @{ token=$verifyToken } "verify"
  Check "activate -> 200" ((C-Status "POST" "$base/api/auth/verify-email" $null $bVerify) -eq 200) ""

  $jarMem = "$tmp\s7e-mem.jar"; Remove-Item $jarMem -EA SilentlyContinue
  $bLogin = Json @{ email=$email; password=$memberPass } "login"
  Check "login -> 200" ((C-Status "POST" "$base/api/auth/login" $jarMem $bLogin) -eq 200) ""

  Check "notifications page renders -> 200" ((C-Status "GET" "$base/dashboard/notifications" $jarMem $null "$tmp\notifs.txt") -eq 200) ""
  $nb = Body "$tmp\notifs.txt"
  Check "feed contains 'Verify your email'" ($nb -match 'Verify your email') ""
  Check "feed is not empty-state" ($nb -notmatch 'Nothing here yet') ""
  $cnt = Sql "SELECT count(*)::text FROM ""Notification"" n JOIN ""User"" u ON u.id=n.""userId"" WHERE u.email='$email';"
  Check "DB has >=1 notification for this user" ([int]$cnt -ge 1) "count=$cnt"
}
catch {
  Write-Host "ABORTED: $_"
  Add-Content -LiteralPath $transcript -Value "ABORTED: $_"
}
finally {
  Pop-Location
  if ($proc) { try { Stop-Process -Id $proc.Id -Force -EA SilentlyContinue } catch { } }
  Free-Port $port | Out-Null
}

$EXPECTED_CHECKS = 9
Check "the run reached the end (no silent abort)" (($script:pass + $script:fail) -ge $EXPECTED_CHECKS) "ran=$($script:pass + $script:fail) expected>=$EXPECTED_CHECKS"
$line = "==== PHASE 7e SMOKE: $($script:pass) passed, $($script:fail) failed ===="
Write-Host $line; Add-Content -LiteralPath $transcript -Value $line
exit $(if ($script:fail -gt 0) { 1 } else { 0 })
