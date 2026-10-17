# GTHubX Phase 7b live smoke: the Resend mail layer.
#
# No provider account is needed to prove the mail layer is real, because the
# email's payload IS the next step of the flow. The harness registers a member,
# reads the message the dev transport logged, pulls the verification link out of
# it and uses that link to activate the account; then does the same with a
# password reset, signing in with the new password and failing with the old one.
# Finally it confirms a registration payment through the gateway webhook and
# asserts the member is told about the settlement, exactly once.
#
# What this does NOT prove: that Resend accepts our request. That is pinned by
# unit tests against the wire shape (tests/notifications/resend.test.ts) and
# needs a live key to go further. This run is honest about using the dev path -
# it asserts the API key is blank first.
#
# Harness discipline: curl.exe is the record (193); SQL doubles quotes (207);
# single-row filters wrapped in @() (211); ${} braces before a colon (216);
# port freed and verified or the run aborts (194); raw SQL pins the timezone
# (218).
$ErrorActionPreference = "Continue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$port = 3500
$tmp = "C:\Users\PC\AppData\Local\Temp\opencode"
$transcript = "$tmp\gthubx-phase7b-results.txt"
$outLog = "$tmp\gthubx-phase7b-dev.out.log"
$errLog = "$tmp\gthubx-phase7b-dev.err.log"
$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
Set-Content -LiteralPath $transcript -Value "==== PHASE 7b SMOKE $(Get-Date -Format s) ====" -Encoding UTF8
$script:pass = 0; $script:fail = 0

function Check($name, $ok, $detail) {
  if ($ok) { $script:pass++ } else { $script:fail++ }
  $line = "[{0}] {1} :: {2}" -f $(if ($ok) { "PASS" } else { "FAIL" }), $name, $detail
  Write-Host $line; Add-Content -LiteralPath $transcript -Value $line
}
function NonEmpty($s) { return ($s -ne $null -and "$s" -ne "") }
function C-Status($method, $url, $jar, $bodyFile, $out = "$tmp\last7b.txt", $extraHeaders = @()) {
  $a = @("-s","-o",$out,"-w","%{http_code}","--max-redirs","0","--max-time","60","-X",$method,$url)
  if ($jar) { $a += @("-b",$jar,"-c",$jar) }
  if ($bodyFile) { $a += @("-H","Content-Type: application/json","--data-binary","@$bodyFile") }
  foreach ($h in $extraHeaders) { $a += @("-H",$h) }
  return (& curl.exe @a 2>$null)
}
function Json($obj, $name) {
  $f = "$tmp\b7b-$name-$([guid]::NewGuid().ToString('N').Substring(0,6)).json"
  $obj | ConvertTo-Json -Compress | Set-Content -LiteralPath $f -Encoding UTF8
  return $f
}
function Sql($query) {
  $f = "$tmp\q7b-$([guid]::NewGuid().ToString('N').Substring(0,8)).sql"
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

# The app logs through both streams depending on the logger, so read both.
function Log-Text {
  $o = Get-Content -LiteralPath $outLog -Raw -ErrorAction SilentlyContinue
  $e = Get-Content -LiteralPath $errLog -Raw -ErrorAction SilentlyContinue
  return ("$o`n$e")
}
# Poll: the log is written by another process, so a fixed sleep would be a race.
function Wait-Log([string]$pattern, [int]$seconds = 20) {
  for ($i = 0; $i -lt $seconds; $i++) {
    $m = [regex]::Match((Log-Text), $pattern)
    if ($m.Success) { return $m.Value }
    Start-Sleep -Seconds 1
  }
  return $null
}
function Count-Log([string]$pattern) {
  return ([regex]::Matches((Log-Text), $pattern)).Count
}
# The email is only proven useful if the link inside it can finish the flow.
function Url-Token([string]$pattern) {
  $m = [regex]::Match((Log-Text), $pattern)
  if (-not $m.Success) { return $null }
  return ($m.Value -split 'token=')[1]
}

$envLine = (Select-String -Path "$root\.env" -Pattern '^DATABASE_URL=' | Select-Object -First 1).Line
$script:dbUrl = (($envLine -replace '^DATABASE_URL=', '').Trim().Trim('"') -split '\?')[0]
$resendLine = (Select-String -Path "$root\.env" -Pattern '^RESEND_API_KEY=' | Select-Object -First 1).Line
$resendKey = if ($resendLine) { ($resendLine -replace '^RESEND_API_KEY=', '').Trim().Trim('"') } else { "" }
$webhookSecret = ""
if ((Get-Content "$root\.env" -Raw) -match 'PAY2CRYPTO_WEBHOOK_SECRET="?([^"\r\n]+)"?') { $webhookSecret = $Matches[1].Trim() }
$stamp = (Get-Date -Format 'HHmmss') + (Get-Random -Minimum 100 -Maximum 999)
$email = "mailer-$stamp@p7b-fixture.test"
$oldPass = "Original-Pass-1234"
$newPass = "Replaced-Pass-5678"

Push-Location $root
if (-not (Free-Port $port)) { Add-Content $transcript "PORT NOT FREE"; Pop-Location; exit 1 }

$proc = $null
try {
  # Honesty gate: this run exercises the dev transport, and says so.
  Check "no Resend key is configured (this run proves the dev path)" (-not (NonEmpty $resendKey)) "key_len=$($resendKey.Length)"
  Check "the webhook secret is readable for this run" (NonEmpty $webhookSecret) "secret_len=$($webhookSecret.Length)"

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

  # ------------------------------------------------- 1. the verification email
  $bReg = Json @{ fullName="Phase Seven Mailer"; email=$email; password=$oldPass; country="PH" } "reg"
  Check "register -> 201" ((C-Status "POST" "$base/api/auth/register" $null $bReg) -eq 201) ""

  $subject = '\[email:dev\] to=' + [regex]::Escape($email) + ' subject="Verify your Global Traders HubX email"'
  Check "the verification email was composed for this member, with the template's subject" ((Wait-Log $subject 20) -ne $null) ""

  $verifyToken = Url-Token 'https?://[^\s"]*/verify-email\?token=[A-Za-z0-9_\-]+'
  Check "the email carries a usable verification link" (NonEmpty $verifyToken) "token_len=$($verifyToken.Length)"

  $bVerify = Json @{ token=$verifyToken } "verify"
  Check "the link from the email verifies the account -> 200" ((C-Status "POST" "$base/api/auth/verify-email" $null $bVerify) -eq 200) ""
  Check "the member is now ACTIVE with emailVerifiedAt set" ((Sql "SELECT status||'|'||(CASE WHEN ""emailVerifiedAt"" IS NULL THEN 'null' ELSE 'set' END) FROM ""User"" WHERE email='$email';") -eq "ACTIVE|set") ""
  Check "re-using that link is refused -> 400" ((C-Status "POST" "$base/api/auth/verify-email" $null $bVerify) -eq 400) ""

  # ------------------------------------------------------ 2. the reset email
  $bForgot = Json @{ email=$email } "forgot"
  Check "forgot-password -> 200" ((C-Status "POST" "$base/api/auth/forgot-password" $null $bForgot) -eq 200) ""

  $resetSubject = '\[email:dev\] to=' + [regex]::Escape($email) + ' subject="Reset your Global Traders HubX password"'
  Check "the reset email was composed with the template's subject" ((Wait-Log $resetSubject 20) -ne $null) ""

  $resetToken = Url-Token 'https?://[^\s"]*/reset-password\?token=[A-Za-z0-9_\-]+'
  Check "the reset email carries a usable link" (NonEmpty $resetToken) "token_len=$($resetToken.Length)"

  $bReset = Json @{ token=$resetToken; password=$newPass } "reset"
  Check "the link from the reset email sets a new password -> 200" ((C-Status "POST" "$base/api/auth/reset-password" $null $bReset) -eq 200) ""
  Check "the reset link is single-use -> 400 on replay" ((C-Status "POST" "$base/api/auth/reset-password" $null $bReset) -eq 400) ""

  $jar = "$tmp\s7b.jar"; Remove-Item $jar -EA SilentlyContinue
  $bNew = Json @{ email=$email; password=$newPass } "loginnew"
  Check "signing in with the emailed new password -> 200" ((C-Status "POST" "$base/api/auth/login" $jar $bNew) -eq 200) ""
  $bOld = Json @{ email=$email; password=$oldPass } "loginold"
  Check "the OLD password no longer works -> 401" ((C-Status "POST" "$base/api/auth/login" $null $bOld) -eq 401) ""

  # --------------------------------- 3. the settlement email, and only once
  $ref = Sql "SELECT ""paymentRef"" FROM ""Payment"" WHERE ""userId""=(SELECT id FROM ""User"" WHERE email='$email') AND purpose='REGISTRATION' ORDER BY ""createdAt"" DESC LIMIT 1;"
  Check "the member has a registration invoice to pay" (NonEmpty $ref) "ref=$ref"

  $bHook = Json @{ payment_ref=$ref; status="confirmed"; tx_hash="0x7bmail"; payment_amount=55 } "hook"
  $hookStatus = C-Status "POST" "$base/api/webhooks/pay2crypto" $null $bHook "$tmp\last7b.txt" @("x-pay2crypto-secret: $webhookSecret")
  Check "the gateway webhook settles the registration -> 200 applied" (($hookStatus -eq 200) -and ((Body "$tmp\last7b.txt") -match '"applied":true')) "status=$hookStatus"

  $paidSubject = '\[email:dev\] to=' + [regex]::Escape($email) + ' subject="Your Global Traders HubX registration is confirmed"'
  Check "the member is told their registration is confirmed" ((Wait-Log $paidSubject 20) -ne $null) ""
  Check "the confirmation states the amount WE recorded" (((Log-Text) -match 'registration fee of USDT 55\.00') ) ""

  $before = Count-Log $paidSubject
  C-Status "POST" "$base/api/webhooks/pay2crypto" $null $bHook "$tmp\last7b.txt" @("x-pay2crypto-secret: $webhookSecret") | Out-Null
  Start-Sleep -Seconds 2
  Check "a replayed webhook sends no second email" ((Count-Log $paidSubject) -eq $before) "before=$before after=$(Count-Log $paidSubject)"

  # --------------------------------------------------- 4. honest degradation
  Check "no message was reported as delivered on the dev path" ((Log-Text) -notmatch '\[email\] Resend refused') ""
}
finally {
  Pop-Location
  if ($proc) { try { Stop-Process -Id $proc.Id -Force -EA SilentlyContinue } catch { } }
  Free-Port $port | Out-Null
}

$line = "==== PHASE 7b SMOKE: $($script:pass) passed, $($script:fail) failed ===="
Write-Host $line; Add-Content -LiteralPath $transcript -Value $line
exit $(if ($script:fail -gt 0) { 1 } else { 0 })
