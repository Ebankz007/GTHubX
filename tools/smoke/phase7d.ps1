# GTHubX Phase 7d live smoke: identity minimisation, and the access record.
#
# The claim under test is not "a column was renamed". It is the one 7d makes
# about the platform's own behaviour:
#
#   A member's document number is needed to CHECK them, not to KEEP them.
#   After this phase, the number a member typed exists nowhere in the
#   database - only a keyed digest (duplicate detection) and its last four
#   characters (what a reviewer matches against) survive - and every time an
#   admin opens a submission's details, the platform writes down that it did.
#
# So the harness proves the negative (the raw value is absent) rather than
# the positive (the migration ran). A migration that ran and left a copy
# behind is exactly the failure this phase exists to prevent:
#
#   1. submit an identity with a known document number
#   2. prove the number appears in NO column of KycProfile, in NO audit row,
#      and in NO dev log line - the three surfaces that could have kept it
#   3. prove the digest that replaced it is keyed: 64 lowercase hex, and NOT
#      sha256(value) - an unkeyed digest of a short structured number is
#      enumerable and is not minimisation, it is costume
#   4. prove the admin queue renders without the address, the birth date or
#      the number - and that merely LOOKING at the queue writes no audit row
#      (the list is plain anchors on purpose; a prefetch that recorded views
#      would be a trail of imagined accesses)
#   5. prove opening one submission writes exactly one kyc.view row naming
#      the admin who opened it, and that the detail page shows `ends ####`
#      rather than the number
#   6. prove the member page says out loud what the platform now does
#   7. prove the retention job runs and, with nothing due, touches nothing
#
# Harness discipline: curl.exe is the record (193); SQL doubles quotes (207);
# single-row filters wrapped in @() (211); ${} braces before a colon (216);
# port freed and verified or the run aborts (194); SQL files are ASCII (212);
# the expected-check guard turns a short run into a failure (220); every
# counter write is $script:-scoped (222); hashtables are cloned, never merged
# with + (223).
$ErrorActionPreference = "Continue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$port = 3500
$tmp = "C:\Users\PC\AppData\Local\Temp\opencode"
$transcript = "$tmp\gthubx-phase7d-results.txt"
$outLog = "$tmp\gthubx-phase7d-dev.out.log"
$errLog = "$tmp\gthubx-phase7d-dev.err.log"
$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
Set-Content -LiteralPath $transcript -Value "==== PHASE 7d SMOKE $(Get-Date -Format s) ====" -Encoding UTF8
$script:pass = 0; $script:fail = 0

function Check($name, $ok, $detail) {
  if ($ok) { $script:pass++ } else { $script:fail++ }
  $line = "[{0}] {1} :: {2}" -f $(if ($ok) { "PASS" } else { "FAIL" }), $name, $detail
  Write-Host $line; Add-Content -LiteralPath $transcript -Value $line
}
function NonEmpty($s) { return ($s -ne $null -and "$s" -ne "") }
function C-Status($method, $url, $jar, $bodyFile, $out = "$tmp\last7d.txt", $extraHeaders = @()) {
  $a = @("-s","-o",$out,"-w","%{http_code}","--max-redirs","0","--max-time","60","-X",$method,$url)
  if ($jar) { $a += @("-b",$jar,"-c",$jar) }
  if ($bodyFile) { $a += @("-H","Content-Type: application/json","--data-binary","@$bodyFile") }
  foreach ($h in $extraHeaders) { $a += @("-H",$h) }
  return (& curl.exe @a 2>$null)
}
function Json($obj, $name) {
  $f = "$tmp\b7d-$name-$([guid]::NewGuid().ToString('N').Substring(0,6)).json"
  $obj | ConvertTo-Json -Compress | Set-Content -LiteralPath $f -Encoding UTF8
  return $f
}
function Sql($query) {
  $f = "$tmp\q7d-$([guid]::NewGuid().ToString('N').Substring(0,8)).sql"
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

# The probe value is unique to this run: a stale row from an earlier attempt
# must not be able to satisfy (or fail) the absence checks by accident.
$stamp = (Get-Date -Format 'HHmmss') + (Get-Random -Minimum 100 -Maximum 999)
$email = "minimiser-$stamp@p7d-fixture.test"
$memberPass = "Original-Pass-1234"
$idNumber = "A0$stamp" + "9"           # 9 chars, uppercase letter + digits
$idTail = $idNumber.Substring($idNumber.Length - 4)
$address = "12 Marina Road, Lagos Island, Lagos 101001"
$dob = "1990-05-04"

# The unkeyed digest, computed here exactly as an attacker would: if the stored
# value ever equals this, the "keyed digest" claim is false.
$sha = [System.Security.Cryptography.SHA256]::Create()
$unkeyedHex = (($sha.ComputeHash([System.Text.Encoding]::ASCII.GetBytes($idNumber))) |
  ForEach-Object { $_.ToString("x2") }) -join ""

$facts = @{
  legalName = "Ada Nwosu"
  dateOfBirth = $dob
  country = "Nigeria"
  address = $address
  idType = "PASSPORT"
  idNumber = $idNumber
}

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

  # ------------------------------------------------ 1. a live member submits
  $bReg = Json @{ fullName="Phase Seven Minimiser"; email=$email; password=$memberPass; country="PH" } "reg"
  Check "register -> 201" ((C-Status "POST" "$base/api/auth/register" $null $bReg) -eq 201) ""
  Check "the activation email was composed for this member" ((Wait-Log ('\[email:dev\] to=' + [regex]::Escape($email)) 20) -ne $null) ""
  $verifyToken = Url-Token 'https?://[^\s"]*/verify-email\?token=[A-Za-z0-9_\-]+'
  $bVerify = Json @{ token=$verifyToken } "verify"
  Check "the emailed link activates the account -> 200" ((C-Status "POST" "$base/api/auth/verify-email" $null $bVerify) -eq 200) ""

  $jarMem = "$tmp\s7d-mem.jar"; Remove-Item $jarMem -EA SilentlyContinue
  $bLogin = Json @{ email=$email; password=$memberPass } "login"
  Check "the member signs in -> 200" ((C-Status "POST" "$base/api/auth/login" $jarMem $bLogin) -eq 200) ""

  $bKyc = Json $facts "kyc"
  Check "submitting identity details -> 200 PENDING" (((C-Status "POST" "$base/api/account/kyc" $jarMem $bKyc) -eq 200) -and ((Body "$tmp\last7d.txt") -match '"status":"PENDING"')) ""

  $profileId = Sql "SELECT id FROM ""KycProfile"" WHERE ""userId""=(SELECT id FROM ""User"" WHERE email='$email');"
  Check "the submission is on file" (NonEmpty $profileId) "profile=$profileId"

  # ------------------------------------ 2. the number exists nowhere in the DB
  Check "only the last four characters were kept" ((Sql "SELECT ""idNumberLast4"" FROM ""KycProfile"" WHERE id='$profileId';") -eq $idTail) "tail=$idTail"

  Check "the digest is 64-hex AND keyed (not bare sha256 of the value)" ((Sql "SELECT (CASE WHEN ""idNumberHash"" ~ '^[0-9a-f]{64}$' THEN 'hex64' ELSE 'bad' END)||'|'||(CASE WHEN ""idNumberHash""='$unkeyedHex' THEN 'unkeyed' ELSE 'keyed' END) FROM ""KycProfile"" WHERE id='$profileId';") -eq "hex64|keyed") "unkeyed=$unkeyedHex"

  Check "the idNumber column is gone from the schema (hash + last4 present)" ((Sql "SELECT (SELECT count(*)::text FROM information_schema.columns WHERE table_name='KycProfile' AND column_name='idNumber')||'|'||(SELECT count(*)::text FROM information_schema.columns WHERE table_name='KycProfile' AND column_name='idNumberHash')||'|'||(SELECT count(*)::text FROM information_schema.columns WHERE table_name='KycProfile' AND column_name='idNumberLast4');") -eq "0|1|1") ""

  Check "the raw number appears in no column of any KycProfile row" ((Sql "SELECT count(*)::text FROM ""KycProfile"" p WHERE row_to_json(p)::text LIKE '%$idNumber%';") -eq "0") ""

  Check "the raw number appears in no audit row" ((Sql "SELECT count(*)::text FROM ""AuditLog"" a WHERE row_to_json(a)::text LIKE '%$idNumber%';") -eq "0") ""

  # -------------------------------------------------- 3. what the member sees
  # The retention notice lives with the resubmission form (`submittable`), so
  # on a PENDING submission the page can only prove the negative here; the
  # positive assertion waits until the reviewer rejects and the form returns.
  Check "the member page renders in review and does not echo the raw number back" (((C-Status "GET" "$base/dashboard/verification" $jarMem $null "$tmp\mem7d.txt") -eq 200) -and ((Body "$tmp\mem7d.txt") -notmatch $idNumber)) ""

  # ------------------------------------------------- 4. the queue stays thin
  $jarAdm = "$tmp\s7d-adm.jar"; Remove-Item $jarAdm -EA SilentlyContinue
  $bAdm = Json @{ email="admin@smoke.local"; password="Smoke-Admin-Pass-1" } "adm"
  Check "SUPER_ADMIN signs in -> 200" ((C-Status "POST" "$base/api/admin/login" $jarAdm $bAdm) -eq 200) ""

  $viewsBefore = Sql "SELECT count(*)::text FROM ""AuditLog"" WHERE action='kyc.view' AND ""entityId""='$profileId';"
  Check "no kyc.view row exists before anyone opens the submission" ($viewsBefore -eq "0") "count=$viewsBefore"

  Check "the queue renders with the member on it" (((C-Status "GET" "$base/admin/kyc" $jarAdm $null "$tmp\queue7d.txt") -eq 200) -and ((Body "$tmp\queue7d.txt") -match [regex]::Escape($email))) ""

  Check "the queue offers the detail link" ((Body "$tmp\queue7d.txt") -match 'Review details') ""
  Check "the queue does not render the address" ((Body "$tmp\queue7d.txt") -notmatch [regex]::Escape($address)) ""
  Check "the queue does not render the birth date" ((Body "$tmp\queue7d.txt") -notmatch $dob) ""
  Check "the queue does not render the raw number" ((Body "$tmp\queue7d.txt") -notmatch $idNumber) ""

  Check "visiting the queue writes no kyc.view row (plain anchors, no prefetch trail)" ((Sql "SELECT count(*)::text FROM ""AuditLog"" WHERE action='kyc.view' AND ""entityId""='$profileId';") -eq $viewsBefore) "before=$viewsBefore"

  # ------------------------------------- 5. opening a submission is recorded
  Check "the detail page renders for the reviewer -> 200" (((C-Status "GET" "$base/admin/kyc/$profileId" $jarAdm $null "$tmp\detail7d.txt") -eq 200) -and $((Body "$tmp\detail7d.txt") -ne $null)) ""

  Check "the detail page shows the reference, not the number" (((Body "$tmp\detail7d.txt") -match [regex]::Escape("ends $idTail")) -and ((Body "$tmp\detail7d.txt") -match 'does not keep the full number')) ""

  Check "the detail page does not render the raw number anywhere" ((Body "$tmp\detail7d.txt") -notmatch $idNumber) ""

  Check "opening it wrote exactly one kyc.view row" ((Sql "SELECT count(*)::text FROM ""AuditLog"" WHERE action='kyc.view' AND ""entityId""='$profileId';") -eq ([string]([int]$viewsBefore + 1))) "before=$viewsBefore"

  Check "the row names the admin who opened it, with an address recorded" ((Sql "SELECT (CASE WHEN ""adminId""=(SELECT id FROM ""Admin"" WHERE email='admin@smoke.local') THEN 'admin' ELSE 'other' END)||'|'||(CASE WHEN ip IS NULL OR ip='' THEN 'noip' ELSE 'ip' END) FROM ""AuditLog"" WHERE action='kyc.view' AND ""entityId""='$profileId' ORDER BY ""createdAt"" DESC LIMIT 1;") -eq "admin|ip") ""

  Check "a member session cannot open the detail page" ((C-Status "GET" "$base/admin/kyc/$profileId" $jarMem $null "$tmp\member7d-denied.txt") -ne 200) "status=$(C-Status "GET" "$base/admin/kyc/$profileId" $jarMem $null "$tmp\member7d-denied.txt")"

  # ------------------------------------------------ 4b. rejection to surface
  $reason = "The document number does not match the name given."
  $bReject = Json @{ action="REJECT"; reason=$reason } "reject"
  Check "rejecting -> 200 REJECTED" (((C-Status "PATCH" "$base/api/admin/kyc/$profileId" $jarAdm $bReject) -eq 200) -and ((Body "$tmp\last7d.txt") -match '"status":"REJECTED"')) ""

  Check "the member page on REJECTED shows the minimisation notice and tail" (((C-Status "GET" "$base/dashboard/verification" $jarMem $null "$tmp\mem7d-rej.txt") -eq 200) -and ((Body "$tmp\mem7d-rej.txt") -match [regex]::Escape("We keep only the last four characters")) -and ((Body "$tmp\mem7d-rej.txt") -match [regex]::Escape("ends $idTail"))) ""

  # ------------------------------------------- 5. the logs are a surface too
  Check "the dev logs never printed the raw number" ((Log-Text) -notmatch $idNumber) ""

  # ---------------------------------------------------- 7. retention, quietly
  $purgeDry = (& pnpm db:purge:identity --dry-run 2>&1 | Out-String)
  $dryCode = $LASTEXITCODE
  Check "the retention script's dry run exits 0 and reports its window" (($dryCode -eq 0) -and ($purgeDry -match 'retention\] window')) "exit=$dryCode"
  Check "the dry run does not print any identity value" (($purgeDry -notmatch $idNumber) -and ($purgeDry -notmatch [regex]::Escape("ends $idTail"))) ""

  $purgeReal = (& pnpm db:purge:identity 2>&1 | Out-String)
  $realCode = $LASTEXITCODE
  Check "the retention script runs for real and exits 0" (($realCode -eq 0) -and ($purgeReal -match 'nothing due')) "exit=$realCode"

  Check "with nothing due, the live submission is untouched" ((Sql "SELECT ""idNumberLast4""||'|'||(CASE WHEN ""idNumberHash"" IS NULL THEN 'null' ELSE 'set' END) FROM ""KycProfile"" WHERE id='$profileId';") -eq "$idTail|set") ""
}
catch {
  # An abort must never read as a pass. The exception is recorded, and the
  # check-count guard below turns a short run into a visible failure.
  Write-Host "ABORTED: $_"
  Add-Content -LiteralPath $transcript -Value "ABORTED: $_"
}
finally {
  Pop-Location
  if ($proc) { try { Stop-Process -Id $proc.Id -Force -EA SilentlyContinue } catch { } }
  Free-Port $port | Out-Null
}

# The run above performs 34 checks. Fewer means it stopped early, which must
# fail loudly rather than report a tidy "0 failed" over a half-executed run.
$EXPECTED_CHECKS = 34
Check "the run reached the end (no silent abort)" (($script:pass + $script:fail) -ge $EXPECTED_CHECKS) "ran=$($script:pass + $script:fail) expected>=$EXPECTED_CHECKS"

$line = "==== PHASE 7d SMOKE: $($script:pass) passed, $($script:fail) failed ===="
Write-Host $line; Add-Content -LiteralPath $transcript -Value $line
exit $(if ($script:fail -gt 0) { 1 } else { 0 })
