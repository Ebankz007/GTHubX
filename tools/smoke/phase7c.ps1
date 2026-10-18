# GTHubX Phase 7c live smoke: the identity-verification pipeline.
#
# The claim being tested is not "a form saves a row". It is that the platform
# now does what its own verification page has promised since Phase 4:
# "Required before any withdrawal can be processed."
#
# So the harness proves the *whole* loop, in the order a member lives it:
#   register -> activate -> submit identity -> try to withdraw (refused) ->
#   a reviewer rejects it with a reason -> the member resubmits -> a reviewer
#   verifies -> the withdrawal gate opens.
#
# The gate checks are deliberately paired. The same payout request is sent twice,
# before and after verification, with an empty wallet both times. Before, it must
# answer 403 `kyc_required`; after, it must answer 400 `insufficient_balance`.
# That pairing is the proof that identity is what changed, and that the gate is
# the only thing standing in the way.
#
# What this does NOT prove: that uploaded documents are reviewed. Document bytes
# are not collected on this deployment (see lib/kyc/policy.ts) and the harness
# asserts that fact rather than pretending otherwise.
#
# Harness discipline: curl.exe is the record (193); SQL doubles quotes (207);
# single-row filters wrapped in @() (211); ${} braces before a colon (216);
# port freed and verified or the run aborts (194); SQL files are ASCII (212);
# a helper's parameter must actually be wired to the call (7b's lesson) - see
# C-Status below, which carries $extraHeaders even though nothing here needs it.
$ErrorActionPreference = "Continue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$port = 3500
$tmp = "C:\Users\PC\AppData\Local\Temp\opencode"
$transcript = "$tmp\gthubx-phase7c-results.txt"
$outLog = "$tmp\gthubx-phase7c-dev.out.log"
$errLog = "$tmp\gthubx-phase7c-dev.err.log"
$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
Set-Content -LiteralPath $transcript -Value "==== PHASE 7c SMOKE $(Get-Date -Format s) ====" -Encoding UTF8
$script:pass = 0; $script:fail = 0

function Check($name, $ok, $detail) {
  if ($ok) { $script:pass++ } else { $script:fail++ }
  $line = "[{0}] {1} :: {2}" -f $(if ($ok) { "PASS" } else { "FAIL" }), $name, $detail
  Write-Host $line; Add-Content -LiteralPath $transcript -Value $line
}
function NonEmpty($s) { return ($s -ne $null -and "$s" -ne "") }
function C-Status($method, $url, $jar, $bodyFile, $out = "$tmp\last7c.txt", $extraHeaders = @()) {
  $a = @("-s","-o",$out,"-w","%{http_code}","--max-redirs","0","--max-time","60","-X",$method,$url)
  if ($jar) { $a += @("-b",$jar,"-c",$jar) }
  if ($bodyFile) { $a += @("-H","Content-Type: application/json","--data-binary","@$bodyFile") }
  foreach ($h in $extraHeaders) { $a += @("-H",$h) }
  return (& curl.exe @a 2>$null)
}
function Json($obj, $name) {
  $f = "$tmp\b7c-$name-$([guid]::NewGuid().ToString('N').Substring(0,6)).json"
  $obj | ConvertTo-Json -Compress | Set-Content -LiteralPath $f -Encoding UTF8
  return $f
}
function Sql($query) {
  $f = "$tmp\q7c-$([guid]::NewGuid().ToString('N').Substring(0,8)).sql"
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
$email = "verifier-$stamp@p7c-fixture.test"
$memberPass = "Original-Pass-1234"
# Age boundaries are computed, never hardcoded: a literal "one day short of 18"
# would stop being a minor the day after it was written.
$dobMinor = (Get-Date).AddYears(-18).AddDays(1).ToString("yyyy-MM-dd")
$dobAdult = (Get-Date).AddYears(-18).AddDays(-1).ToString("yyyy-MM-dd")

$facts = @{
  legalName = "Ada Nwosu"
  dateOfBirth = "1990-05-04"
  country = "Nigeria"
  address = "12 Marina Road, Lagos Island, Lagos 101001"
  idType = "PASSPORT"
  idNumber = "A01234567"
}
$payBody = @{ amountCents = 100; method = "BANK_TRANSFER"; destination = "NG0123456789" }

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

  # ------------------------------------------------------- 1. a live member
  $bReg = Json @{ fullName="Phase Seven Verifier"; email=$email; password=$memberPass; country="PH" } "reg"
  Check "register -> 201" ((C-Status "POST" "$base/api/auth/register" $null $bReg) -eq 201) ""

  Check "the activation email was composed for this member" ((Wait-Log ('\[email:dev\] to=' + [regex]::Escape($email)) 20) -ne $null) ""
  $verifyToken = Url-Token 'https?://[^\s"]*/verify-email\?token=[A-Za-z0-9_\-]+'
  $bVerify = Json @{ token=$verifyToken } "verify"
  Check "the emailed link activates the account -> 200" ((C-Status "POST" "$base/api/auth/verify-email" $null $bVerify) -eq 200) ""

  $jarMem = "$tmp\s7c-mem.jar"; Remove-Item $jarMem -EA SilentlyContinue
  $bLogin = Json @{ email=$email; password=$memberPass } "login"
  Check "the member signs in -> 200" ((C-Status "POST" "$base/api/auth/login" $jarMem $bLogin) -eq 200) ""

  Check "submitting identity details without a session -> 401" ((C-Status "POST" "$base/api/account/kyc" $null (Json $facts "kyc-noauth") ) -eq 401) ""

  # ------------------------------------------- 2. the member submits details
  Check "the verification page offers the form" (((C-Status "GET" "$base/dashboard/verification" $jarMem $null "$tmp\kyc1.txt") -eq 200) -and ((Body "$tmp\kyc1.txt") -match 'Verification not started')) ""

  $bKyc = Json $facts "kyc"
  Check "submitting identity details -> 200 PENDING" (((C-Status "POST" "$base/api/account/kyc" $jarMem $bKyc) -eq 200) -and ((Body "$tmp\last7c.txt") -match '"status":"PENDING"')) ""

  Check "the profile and the denormalised user status agree on PENDING" ((Sql "SELECT p.status||'|'||u.""kycStatus"" FROM ""KycProfile"" p JOIN ""User"" u ON u.id=p.""userId"" WHERE u.email='$email';") -eq "PENDING|PENDING") ""

  Check "the page now reports the submission as in review" (((C-Status "GET" "$base/dashboard/verification" $jarMem $null "$tmp\kyc2.txt") -eq 200) -and ((Body "$tmp\kyc2.txt") -match 'Verification in review')) ""

  Check "submitting again while in review -> 409" ((C-Status "POST" "$base/api/account/kyc" $jarMem $bKyc) -eq 409) ""

  # PowerShell 5.1's `+` refuses to merge hashtables with duplicate keys, so a
  # variant fixture is a clone with one field overwritten.
  $factsBadDay = $facts.Clone(); $factsBadDay["dateOfBirth"] = "2024-02-31"
  $bBadDay = Json $factsBadDay "baddate"
  Check "an impossible calendar date -> 400" ((C-Status "POST" "$base/api/account/kyc" $jarMem $bBadDay) -eq 400) ""

  $factsMinor = $facts.Clone(); $factsMinor["dateOfBirth"] = $dobMinor
  $bMinor = Json $factsMinor "minor"
  Check "an applicant one day short of the age floor -> 400" ((C-Status "POST" "$base/api/account/kyc" $jarMem $bMinor) -eq 400) "dob=$dobMinor"

  # ---------------------------- 3. the gate, before there is any verification
  $bPay = Json $payBody "pay"
  Check "a payout is refused before verification -> 403 kyc_required" (((C-Status "POST" "$base/api/account/payouts" $jarMem $bPay) -eq 403) -and ((Body "$tmp\last7c.txt") -match '"code":"kyc_required"')) ""

  # ----------------------------------------------------- 4. the review queue
  $jarAdm = "$tmp\s7c-adm.jar"; Remove-Item $jarAdm -EA SilentlyContinue
  $bAdm = Json @{ email="admin@smoke.local"; password="Smoke-Admin-Pass-1" } "adm"
  Check "SUPER_ADMIN signs in -> 200" ((C-Status "POST" "$base/api/admin/login" $jarAdm $bAdm) -eq 200) ""

  $profileId = Sql "SELECT id FROM ""KycProfile"" WHERE ""userId""=(SELECT id FROM ""User"" WHERE email='$email');"
  Check "the queue has a submission to decide" (NonEmpty $profileId) "profile=$profileId"

  Check "the review queue renders with the member on it" (((C-Status "GET" "$base/admin/kyc" $jarAdm $null "$tmp\kycadmin.txt") -eq 200) -and ((Body "$tmp\kycadmin.txt") -match [regex]::Escape($email))) ""

  Check "a member session cannot open the review queue" ((C-Status "GET" "$base/admin/kyc" $jarMem $null "$tmp\kycdenied.txt") -ne 200) "status=$(C-Status "GET" "$base/admin/kyc" $jarMem $null "$tmp\kycdenied.txt")"

  # ------------------------------------------------ 5. rejection, and why
  Check "rejecting with no reason -> 400" ((C-Status "PATCH" "$base/api/admin/kyc/$profileId" $jarAdm (Json @{ action="REJECT" } "noreason")) -eq 400) ""
  Check "rejecting with a one-word reason -> 400" ((C-Status "PATCH" "$base/api/admin/kyc/$profileId" $jarAdm (Json @{ action="REJECT"; reason="no" } "weak")) -eq 400) ""

  $reason = "The document number does not match the name given."
  $bReject = Json @{ action="REJECT"; reason=$reason } "reject"
  Check "rejecting with a reason -> 200 REJECTED" (((C-Status "PATCH" "$base/api/admin/kyc/$profileId" $jarAdm $bReject) -eq 200) -and ((Body "$tmp\last7c.txt") -match '"status":"REJECTED"')) ""

  Check "profile and user agree on REJECTED, with the reason kept" ((Sql "SELECT p.status||'|'||u.""kycStatus""||'|'||(CASE WHEN p.""rejectionReason"" IS NULL THEN 'null' ELSE 'set' END) FROM ""KycProfile"" p JOIN ""User"" u ON u.id=p.""userId"" WHERE u.email='$email';") -eq "REJECTED|REJECTED|set") ""

  Check "the member is emailed that verification needs attention" ((Wait-Log 'subject="Your Global Traders HubX verification needs attention"' 20) -ne $null) ""
  Check "the email quotes the reviewer's reason verbatim" (((Log-Text) -match [regex]::Escape($reason))) ""

  Check "the audit trail records the rejection" ((Sql "SELECT action FROM ""AuditLog"" WHERE entity='KycProfile' AND ""entityId""='$profileId' ORDER BY ""createdAt"" DESC LIMIT 1;") -eq "kyc.reject") ""
  Check "deciding the same submission twice -> 409" ((C-Status "PATCH" "$base/api/admin/kyc/$profileId" $jarAdm $bReject) -eq 409) ""

  # ------------------------------------------ 6. the member fixes and resubmits
  Check "the member resubmits after a rejection -> 200 PENDING" (((C-Status "POST" "$base/api/account/kyc" $jarMem $bKyc) -eq 200) -and ((Body "$tmp\last7c.txt") -match '"status":"PENDING"')) ""
  Check "resubmission clears the previous verdict and reason" ((Sql "SELECT p.status||'|'||(CASE WHEN p.""reviewedAt"" IS NULL THEN 'null' ELSE 'set' END)||'|'||(CASE WHEN p.""rejectionReason"" IS NULL THEN 'null' ELSE 'set' END) FROM ""KycProfile"" p JOIN ""User"" u ON u.id=p.""userId"" WHERE u.email='$email';") -eq "PENDING|null|null") ""

  # --------------------------------------------------- 7. verification
  $bApprove = Json @{ action="VERIFY" } "approve"
  Check "verifying -> 200 VERIFIED" (((C-Status "PATCH" "$base/api/admin/kyc/$profileId" $jarAdm $bApprove) -eq 200) -and ((Body "$tmp\last7c.txt") -match '"status":"VERIFIED"')) ""

  Check "the user is VERIFIED" ((Sql "SELECT ""kycStatus"" FROM ""User"" WHERE email='$email';") -eq "VERIFIED") ""
  Check "the member is emailed that their identity is verified" ((Wait-Log 'subject="Your Global Traders HubX identity is verified"' 20) -ne $null) ""
  Check "the audit trail records the verification" ((Sql "SELECT action FROM ""AuditLog"" WHERE entity='KycProfile' AND ""entityId""='$profileId' ORDER BY ""createdAt"" DESC LIMIT 1;") -eq "kyc.verify") ""
  Check "the verification page reports the member verified" (((C-Status "GET" "$base/dashboard/verification" $jarMem $null "$tmp\kyc3.txt") -eq 200) -and ((Body "$tmp\kyc3.txt") -match 'Identity verified')) ""

  # --------------------------- 8. the same payout request, now past the gate
  Check "the same payout now clears the gate and fails only on balance -> 400 insufficient_balance" (((C-Status "POST" "$base/api/account/payouts" $jarMem $bPay) -eq 400) -and ((Body "$tmp\last7c.txt") -match '"code":"insufficient_balance"')) ""

  Check "a verified member cannot re-enter the queue -> 409" ((C-Status "POST" "$base/api/account/kyc" $jarMem $bKyc) -eq 409) ""
  Check "verifying an already-verified submission -> 409" ((C-Status "PATCH" "$base/api/admin/kyc/$profileId" $jarAdm $bApprove) -eq 409) ""

  # --------------------------------------------------- 9. honest degradation
  Check "document upload is reported as disabled, and no file was ever collected" ((Sql "SELECT (CASE WHEN p.""documents"" IS NULL THEN 'null' ELSE 'set' END) FROM ""KycProfile"" p JOIN ""User"" u ON u.id=p.""userId"" WHERE u.email='$email';") -eq "null") ""
  Check "no email was reported as refused by the provider on the dev path" ((Log-Text) -notmatch '\[email\] Resend refused') ""
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

# The run above performs 38 checks. Fewer means it stopped early, which must
# fail loudly rather than report a tidy "0 failed" over a half-executed run.
$EXPECTED_CHECKS = 38
Check "the run reached the end (no silent abort)" (($script:pass + $script:fail) -ge $EXPECTED_CHECKS) "ran=$($script:pass + $script:fail) expected>=$EXPECTED_CHECKS"

$line = "==== PHASE 7c SMOKE: $($script:pass) passed, $($script:fail) failed ===="
Write-Host $line; Add-Content -LiteralPath $transcript -Value $line
exit $(if ($script:fail -gt 0) { 1 } else { 0 })
