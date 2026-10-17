# GTHubX Phase 7a live smoke: the Pay2Crypto rail.
#
# Proves, end to end, against a real server:
#   - registering attaches a live (mock-mode) checkout to the PENDING invoice;
#   - the member's own checkout endpoint returns the link, refreshes a stale one
#     by issuing a NEW invoice and preserving the old row, and refuses another
#     member's invoice (404);
#   - the webhook fails closed with no secret, refuses a wrong secret, refuses an
#     unknown reference, refuses an amount mismatch, and ACKNOWLEDGES a non-final
#     status without applying it;
#   - a confirmed callback settles through the 6a spine (payment PAID, Registration,
#     PlatformFee SETTLED, pools accrued) and a replay changes nothing;
#   - an EXPIRED invoice is still payable when the money arrives, and a second
#     invoice for an already-registered member is recorded but NOT settled.
#
# Harness discipline in force: curl.exe is the record (193); SQL doubles quotes
# (207); single-row filters wrapped in @() (211); ${} braces before a colon (216);
# port freed and verified or the run aborts (194).
$ErrorActionPreference = "Continue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$port = 3500
$tmp = "C:\Users\PC\AppData\Local\Temp\opencode"
$transcript = "$tmp\gthubx-phase7a-results.txt"
$outLog = "$tmp\gthubx-phase7a-dev.out.log"
$errLog = "$tmp\gthubx-phase7a-dev.err.log"
$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
Set-Content -LiteralPath $transcript -Value "==== PHASE 7a SMOKE $(Get-Date -Format s) ====" -Encoding UTF8
$script:pass = 0; $script:fail = 0

function Check($name, $ok, $detail) {
  if ($ok) { $script:pass++ } else { $script:fail++ }
  $line = "[{0}] {1} :: {2}" -f $(if ($ok) { "PASS" } else { "FAIL" }), $name, $detail
  Write-Host $line; Add-Content -LiteralPath $transcript -Value $line
}
function NonEmpty($s) { return ($s -ne $null -and "$s" -ne "") }
function C-Status($method, $url, $jar, $bodyFile, $out = "$tmp\last7a.txt", $extraHeaders = @()) {
  $a = @("-s","-o",$out,"-w","%{http_code}","--max-redirs","0","--max-time","60","-X",$method,$url)
  if ($jar) { $a += @("-b",$jar,"-c",$jar) }
  if ($bodyFile) { $a += @("-H","Content-Type: application/json","--data-binary","@$bodyFile") }
  foreach ($h in $extraHeaders) { $a += @("-H",$h) }
  return (& curl.exe @a 2>$null)
}
function Json($obj, $name) {
  $f = "$tmp\b7a-$name-$([guid]::NewGuid().ToString('N').Substring(0,6)).json"
  $obj | ConvertTo-Json -Compress | Set-Content -LiteralPath $f -Encoding UTF8
  return $f
}
function Sql($query) {
  $f = "$tmp\q7a-$([guid]::NewGuid().ToString('N').Substring(0,8)).sql"
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

$envText = Get-Content "$root\.env" -Raw
$envLine = (Select-String -Path "$root\.env" -Pattern '^DATABASE_URL=' | Select-Object -First 1).Line
$script:dbUrl = (($envLine -replace '^DATABASE_URL=', '').Trim().Trim('"') -split '\?')[0]
$secret = ""
if ($envText -match 'PAY2CRYPTO_WEBHOOK_SECRET="?([^"\r\n]+)"?') { $secret = $Matches[1].Trim() }
$stamp = (Get-Date -Format 'HHmmss') + (Get-Random -Minimum 100 -Maximum 999)

Push-Location $root
if (-not (Free-Port $port)) { Add-Content $transcript "PORT NOT FREE"; Pop-Location; exit 1 }

$proc = $null
try {
  Check "webhook secret is configured for this run" (NonEmpty $secret) "len=$($secret.Length)"

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

  # ---------------------------------------------------------------- member A
  $emailA = "buyer-$stamp@p2c-fixture.test"
  $jarA = "$tmp\s7a-a.jar"; Remove-Item $jarA -EA SilentlyContinue
  $bReg = Json @{ fullName="Phase Seven Buyer"; email=$emailA; password="Buyer-Pass-1234"; country="PH" } "rega"
  Check "register member A -> 201" ((C-Status "POST" "$base/api/auth/register" $null $bReg) -eq 201) ""

  $payA = Sql "SELECT id||'|'||status||'|'||""amountCents""||'|'||""platformFeeCents"" FROM ""Payment"" WHERE ""userId""=(SELECT id FROM ""User"" WHERE email='$emailA') AND purpose='REGISTRATION';"
  $idPayA = ($payA -split '\|')[0]
  $payAStatus = ($payA -split '\|')[1]; $payAAmount = ($payA -split '\|')[2]; $payAFee = ($payA -split '\|')[3]
  Check "invoice created PENDING, 5500 total, 500 platform fee" (($payAAmount -eq "5500") -and ($payAFee -eq "500") -and ($payAStatus -eq "PENDING") -and (NonEmpty $idPayA)) "got=$payA"

  $gwA = Sql "SELECT COALESCE(""paymentUrl"",'')||'|'||COALESCE(""gatewayTxid"",'') FROM ""Payment"" WHERE id='$idPayA';"
  Check "register attached a mock checkout link and gateway id" (($gwA -match 'checkout\.pay2crypto\.com') -and ($gwA -match 'mock-')) "got=$gwA"

  # ---------------------------------------------------------------- auth gates
  Check "GET /api/account/payments without a session -> 401" ((C-Status "GET" "$base/api/account/payments" $null $null) -eq 401) ""
  $bCheckoutEmpty = Json @{} "ck0"
  Check "POST checkout without a session -> 401" ((C-Status "POST" "$base/api/account/payments/$idPayA/checkout" $null $bCheckoutEmpty) -eq 401) ""

  $bLogin = Json @{ email=$emailA; password="Buyer-Pass-1234" } "loginA"
  Check "member A signs in -> 200" ((C-Status "POST" "$base/api/auth/login" $jarA $bLogin) -eq 200) ""

  Check "GET /api/account/payments -> 200 with 1 invoice" (((C-Status "GET" "$base/api/account/payments" $jarA $null) -eq 200) -and ((Body "$tmp\last7a.txt") -match '"paymentRef"')) ""
  Check "GET /dashboard/registration -> 200" ((C-Status "GET" "$base/dashboard/registration" $jarA $null) -eq 200) ""
  Check "the registration page states the TRC20 rail and the 55.00 USDT total" (((Body "$tmp\last7a.txt") -match 'TRC20') -and ((Body "$tmp\last7a.txt") -match 'USDT 55\.00')) ""

  # ------------------------------------------------------- checkout + refresh
  $bCk = Json @{} "ck1"
  Check "POST checkout returns the live link (not refreshed)" (((C-Status "POST" "$base/api/account/payments/$idPayA/checkout" $jarA $bCk) -eq 200) -and ((Body "$tmp\last7a.txt") -match '"refreshed":false')) ""

  # Force the stored link stale, then ask again: a NEW invoice must be issued.
  # Prisma stores UTC in a `timestamp` column while the psql session renders local
  # time, so a bare `now() - interval` would write a value in the app's FUTURE and
  # the "stale" row would look brand new. Pin the timezone.
  Sql "UPDATE ""Payment"" SET ""createdAt"" = (now() at time zone 'UTC') - interval '2 hours' WHERE id='$idPayA';" | Out-Null
  $ck = C-Status "POST" "$base/api/account/payments/$idPayA/checkout" $jarA $bCk
  $ckBody = $null; try { $ckBody = (Body "$tmp\last7a.txt") | ConvertFrom-Json } catch { }
  Check "stale link is refreshed into a NEW invoice" (($ck -eq 200) -and ($ckBody.checkout.refreshed -eq $true) -and ($ckBody.checkout.paymentId -ne $idPayA)) "new=$($ckBody.checkout.paymentId)"
  $idPayB = $ckBody.checkout.paymentId
  $refA = Sql "SELECT ""paymentRef"" FROM ""Payment"" WHERE id='$idPayA';"
  $refB = Sql "SELECT ""paymentRef"" FROM ""Payment"" WHERE id='$idPayB';"
  Check "the old row is preserved as EXPIRED, the new one is PENDING" (((Sql "SELECT status FROM ""Payment"" WHERE id='$idPayA';") -eq "EXPIRED") -and ((Sql "SELECT status FROM ""Payment"" WHERE id='$idPayB';") -eq "PENDING")) ""

  # ------------------------------------------------------------ webhook gate
  $oHook = "$tmp\h7a-hook.txt"; $oWrong = "$tmp\h7a-wrong.txt"; $oUnk = "$tmp\h7a-unk.txt"
  $oNonFinal = "$tmp\h7a-nonfinal.txt"; $oShort = "$tmp\h7a-short.txt"; $oPayA = "$tmp\h7a-paya.txt"
  $oReplay = "$tmp\h7a-replay.txt"; $oPayB = "$tmp\h7a-payb.txt"
  $bHook = Json @{ payment_ref=$refB; status="confirmed"; tx_hash="0xaaa"; payment_amount=55 } "hook"
  Check "webhook with NO secret -> 401" ((C-Status "POST" "$base/api/webhooks/pay2crypto" $null $bHook $oHook) -eq 401) ""
  Check "webhook with a WRONG secret -> 401" ((C-Status "POST" "$base/api/webhooks/pay2crypto" $null $bHook $oWrong @("x-pay2crypto-secret: not-the-secret")) -eq 401) ""
  $hdr = @("x-pay2crypto-secret: $secret")

  $bUnknown = Json @{ payment_ref="REG-DOESNOTEXIST"; status="confirmed" } "unk"
  Check "unknown reference -> 404" ((C-Status "POST" "$base/api/webhooks/pay2crypto" $null $bUnknown $oUnk $hdr) -eq 404) ""

  $bNonFinal = Json @{ payment_ref=$refB; status="broadcast" } "nonfinal"
  $nf = C-Status "POST" "$base/api/webhooks/pay2crypto" $null $bNonFinal $oNonFinal $hdr
  Check "non-final status is ACKNOWLEDGED, not applied" (($nf -eq 200) -and ((Body $oNonFinal) -match '"applied":false') -and ((Sql "SELECT status FROM ""Payment"" WHERE id='$idPayB';") -eq "PENDING")) ""

  $bShort = Json @{ payment_ref=$refB; status="confirmed"; payment_amount=1 } "short"
  $sh = C-Status "POST" "$base/api/webhooks/pay2crypto" $null $bShort $oShort $hdr
  Check "amount mismatch -> 400 and nothing settled" (($sh -eq 400) -and ((Body $oShort) -match 'amount_mismatch') -and ((Sql "SELECT status FROM ""Payment"" WHERE id='$idPayB';") -eq "PENDING")) ""

  # ------------------------------------- the stale invoice the member DID pay
  $poolBefore = [int](Sql "SELECT COALESCE((SELECT ""accruedCents"" FROM ""BonusPool"" WHERE kind='RANK'),0);")
  $leadBefore = [int](Sql "SELECT COALESCE((SELECT ""accruedCents"" FROM ""BonusPool"" WHERE kind='LEADERSHIP'),0);")
  $regBefore = Sql "SELECT count(*) FROM ""Registration"" WHERE ""userId""=(SELECT id FROM ""User"" WHERE email='$emailA');"

  $bPayA = Json @{ payment_ref=$refA; status="confirmed"; tx_hash="0xstaleinvoice"; payment_amount="55.00" } "paya"
  $pa = C-Status "POST" "$base/api/webhooks/pay2crypto" $null $bPayA $oPayA $hdr
  Check "an EXPIRED invoice still settles when the money arrives -> 200 applied" (($pa -eq 200) -and ((Body $oPayA) -match '"applied":true')) ""
  Check "invoice A is PAID, records the on-chain hash, and KEEPS the gateway id" ((Sql "SELECT status||'|'||COALESCE(""txHash"",'')||'|'||(CASE WHEN COALESCE(""gatewayTxid"",'') LIKE 'mock-%' THEN 'kept' ELSE 'lost' END) FROM ""Payment"" WHERE id='$idPayA';") -eq "PAID|0xstaleinvoice|kept") ""
  Check "the registration was settled exactly once" (((Sql "SELECT count(*) FROM ""Registration"" WHERE ""userId""=(SELECT id FROM ""User"" WHERE email='$emailA');") -eq "1") -and ($regBefore -eq "0")) ""
  Check "platform fee recorded SETTLED for 500" ((Sql "SELECT ""amountCents""||'|'||status FROM ""PlatformFee"" WHERE ""paymentId""='$idPayA';") -eq "500|SETTLED") ""
  $poolAfter = [int](Sql "SELECT COALESCE((SELECT ""accruedCents"" FROM ""BonusPool"" WHERE kind='RANK'),0);")
  $leadAfter = [int](Sql "SELECT COALESCE((SELECT ""accruedCents"" FROM ""BonusPool"" WHERE kind='LEADERSHIP'),0);")
  Check "RANK pool accrued exactly 400 from the settled registration" (($poolAfter - $poolBefore) -eq 400) "delta=$($poolAfter - $poolBefore)"
  Check "LEADERSHIP pool accrued exactly 350" (($leadAfter - $leadBefore) -eq 350) "delta=$($leadAfter - $leadBefore)"

  # ------------------------------------------------------------- idempotency
  $replay = C-Status "POST" "$base/api/webhooks/pay2crypto" $null $bPayA $oReplay $hdr
  Check "replaying the confirmed callback changes nothing" (($replay -eq 200) -and ((Body $oReplay) -match '"applied":false') -and ((Sql "SELECT count(*) FROM ""Registration"" WHERE ""userId""=(SELECT id FROM ""User"" WHERE email='$emailA');") -eq "1") -and ((Sql "SELECT count(*) FROM ""PlatformFee"" WHERE ""paymentId""='$idPayA';") -eq "1") -and ((Sql "SELECT COALESCE((SELECT ""accruedCents"" FROM ""BonusPool"" WHERE kind='RANK'),0);") -eq "$poolAfter")) ""

  # --------------------------------- the second invoice: recorded, NOT settled
  $bPayB = Json @{ payment_ref=$refB; status="confirmed"; tx_hash="0xsecondinvoice"; payment_amount=55 } "payb"
  $pb = C-Status "POST" "$base/api/webhooks/pay2crypto" $null $bPayB $oPayB $hdr
  Check "a second invoice for an already-registered member is NOT settled" (($pb -eq 200) -and ((Body $oPayB) -match 'already_registered')) ""
  Check "the overpayment is recorded PAID (refund signal), registration still 1" (((Sql "SELECT status FROM ""Payment"" WHERE id='$idPayB';") -eq "PAID") -and ((Sql "SELECT count(*) FROM ""Registration"" WHERE ""userId""=(SELECT id FROM ""User"" WHERE email='$emailA');") -eq "1") -and ((Sql "SELECT COALESCE((SELECT ""accruedCents"" FROM ""BonusPool"" WHERE kind='RANK'),0);") -eq "$poolAfter")) ""

  # ------------------------------------------------------- ownership + admin
  $emailC = "intruder-$stamp@p2c-fixture.test"
  $jarC = "$tmp\s7a-c.jar"; Remove-Item $jarC -EA SilentlyContinue
  $bRegC = Json @{ fullName="Phase Seven Intruder"; email=$emailC; password="Intruder-Pass-1234" } "regc"
  C-Status "POST" "$base/api/auth/register" $null $bRegC | Out-Null
  $bLoginC = Json @{ email=$emailC; password="Intruder-Pass-1234" } "loginc"
  C-Status "POST" "$base/api/auth/login" $jarC $bLoginC | Out-Null
  Check "another member cannot check out someone else's invoice -> 404" ((C-Status "POST" "$base/api/account/payments/$idPayA/checkout" $jarC $bCk) -eq 404) ""

  $jarAdm = "$tmp\s7a-admin.jar"; Remove-Item $jarAdm -EA SilentlyContinue
  $bAdm = Json @{ email="admin@smoke.local"; password="Smoke-Admin-Pass-1" } "adm"
  Check "SUPER_ADMIN signs in -> 200" ((C-Status "POST" "$base/api/admin/login" $jarAdm $bAdm) -eq 200) ""
  Check "/admin/payments -> 200 and lists the settled invoice" (((C-Status "GET" "$base/admin/payments" $jarAdm $null) -eq 200) -and ((Body "$tmp\last7a.txt") -match $refA)) ""
  Check "member nav links to /dashboard/registration" (((C-Status "GET" "$base/dashboard" $jarA $null) -eq 200) -and ((Body "$tmp\last7a.txt") -match '/dashboard/registration')) ""
  Check "registration page now reports the fee as paid" (((C-Status "GET" "$base/dashboard/registration" $jarA $null) -eq 200) -and ((Body "$tmp\last7a.txt") -match 'Registration fee paid')) ""
}
finally {
  Pop-Location
  if ($proc) { try { Stop-Process -Id $proc.Id -Force -EA SilentlyContinue } catch { } }
  Free-Port $port | Out-Null
}

$line = "==== PHASE 7a SMOKE: $($script:pass) passed, $($script:fail) failed ===="
Write-Host $line; Add-Content -LiteralPath $transcript -Value $line
exit $(if ($script:fail -gt 0) { 1 } else { 0 })
