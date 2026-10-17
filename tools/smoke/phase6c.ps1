# GTHubX Phase 6c live smoke: payouts (hold at request, refund on reject).
# The money model under test, asserted end to end through the REAL member
# login and the REAL admin review endpoints:
#   REQUEST  -> wallet debited NOW (hold); ledger DEBIT/WITHDRAWAL
#   REJECT   -> refund: ledger CREDIT/REFUND, balance restored
#   APPROVE  -> no money moves (review only)
#   PAID     -> no money moves (records external delivery); terminal
# curl.exe is the record (lesson 193); SQL goes through files and PowerShell
# escapes double quotes by DOUBLING them (lessons 188 / 207). Filtered
# single-row results are wrapped in @() (lesson 211).
$ErrorActionPreference = "Continue"
$root = "C:\BerfamWorks\GTHubX"
$port = 3500
$tmp = "C:\Users\PC\AppData\Local\Temp\opencode"
$transcript = "$tmp\gthubx-phase6c-results.txt"
$outLog = "$tmp\gthubx-phase6c-dev.out.log"
$errLog = "$tmp\gthubx-phase6c-dev.err.log"
$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
Set-Content -LiteralPath $transcript -Value "==== PHASE 6c SMOKE $(Get-Date -Format s) ====" -Encoding UTF8
$script:pass = 0; $script:fail = 0

function Check($name, $ok, $detail) {
  if ($ok) { $script:pass++ } else { $script:fail++ }
  $line = "[{0}] {1} :: {2}" -f $(if ($ok) { "PASS" } else { "FAIL" }), $name, $detail
  Write-Host $line; Add-Content -LiteralPath $transcript -Value $line
}
function NonEmpty($s) { return ($s -ne $null -and "$s" -ne "") }
function C-Status($method, $url, $jar, $bodyFile, $out = "$tmp\last-body.txt") {
  $a = @("-s","-o",$out,"-w","%{http_code}","--max-redirs","0","--max-time","60","-X",$method,$url)
  if ($jar) { $a += @("-b",$jar,"-c",$jar) }
  if ($bodyFile) { $a += @("-H","Content-Type: application/json","--data-binary","@$bodyFile") }
  return (& curl.exe @a 2>$null)
}
function C-Post($url, $jar, $bodyFile, $out) {
  $a = @("-s","-o",$out,"-w","%{http_code}","--max-redirs","0","--max-time","60","-X","POST",
         "-H","Content-Type: application/json","--data-binary","@$bodyFile",$url)
  if ($jar) { $a += @("-b",$jar,"-c",$jar) }
  return (& curl.exe @a 2>$null)
}
function Json($obj, $name) {
  $f = "$tmp\b-$name-$([guid]::NewGuid().ToString('N').Substring(0,6)).json"
  $obj | ConvertTo-Json -Compress | Set-Content -LiteralPath $f -Encoding UTF8
  return $f
}
function Sql($query) {
  $f = "$tmp\q-$([guid]::NewGuid().ToString('N').Substring(0,8)).sql"
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

$envLine = (Select-String -Path "$root\.env" -Pattern '^DATABASE_URL=' | Select-Object -First 1).Line
$script:dbUrl = (($envLine -replace '^DATABASE_URL=', '').Trim().Trim('"') -split '\?')[0]

Push-Location $root
if (-not (Free-Port $port)) { Add-Content $transcript "PORT NOT FREE"; Pop-Location; exit 1 }

try {
  # ---- fixture: verified member with a 2000c wallet -------------------------
  $fixOut = "$tmp\gthubx-payout-fixture-out.txt"
  & pnpm db:seed:payout-fixture 2>&1 | Out-File -LiteralPath $fixOut -Encoding utf8
  $fixText = Get-Content $fixOut -Raw -ErrorAction SilentlyContinue
  $fixtureOk = $false
  if ($fixText -match 'PAYOUT_FIXTURE_OK .*wallet=(\d+)') { $fixtureOk = ($Matches[1] -eq "2000") }
  Check "payout fixture built (wallet=2000)" $fixtureOk ($Matches[1])

  $mUser = Sql "SELECT id FROM ""User"" WHERE email = 'payout@payout-fixture.test';"
  Check "fixture member resolvable" (NonEmpty $mUser) "user=$mUser"

  # ---- start app ------------------------------------------------------------
  if (-not (Free-Port $port)) { Add-Content $transcript "PORT NOT FREE"; Pop-Location; exit 1 }
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

  # ---- member signs in through the REAL login route ------------------------
  $jarM = "$tmp\s6c-member.jar"
  Remove-Item $jarM -EA SilentlyContinue
  $bM = Json @{ email="payout@payout-fixture.test"; password="Fixture-Pass-1" } "mlogin"
  Check "member sign-in -> 200" ((C-Post "$base/api/auth/login" $jarM $bM "$tmp\mlogin.json") -eq 200) ""
  Check "member payouts page -> 200" ((C-Status "GET" "$base/dashboard/payouts" $jarM $null) -eq 200) ""

  # ---- request #1: 1000c hold ----------------------------------------------
  $bP1 = Json @{ amountCents=1000; method="BANK_TRANSFER"; destination="KE-BANK-0011" } "p1"
  $c1 = C-Post "$base/api/account/payouts" $jarM $bP1 "$tmp\po1.json"
  $p1 = ""
  try { $p1 = (Get-Content "$tmp\po1.json" -Raw | ConvertFrom-Json).payout.id } catch { }
  Check "request 1000c -> 200 REQUESTED" (($c1 -eq 200) -and (NonEmpty $p1)) "code=$c1 payout=$p1"
  Check "wallet debited immediately (hold): 2000 -> 1000" ((Sql "SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId"" = '$mUser';") -eq "1000") ""
  # NB: '${p1}' braces are mandatory here — "$p1:hold" parses as the scoped
  # variable $p1:hold (scope "p1", name "hold") and silently expands to "".
  Check "hold ledger DEBIT/WITHDRAWAL balanceAfter 1000" ((Sql "SELECT ""direction""||'|'||""type""||'|'||""amountCents""||'|'||""balanceAfterCents""||'|'||""refId"" FROM ""LedgerEntry"" WHERE ""idempotencyKey"" = 'payout:${p1}:hold';") -eq "DEBIT|WITHDRAWAL|1000|1000|$p1") ""
  Check "payout row REQUESTED/WITHDRAWAL/BANK_TRANSFER" ((Sql "SELECT status||'|'||type||'|'||method FROM ""Payout"" WHERE id='$p1';") -eq "REQUESTED|WITHDRAWAL|BANK_TRANSFER") ""

  # ---- over-balance request rolls EVERYTHING back --------------------------
  $bP2 = Json @{ amountCents=5000; method="CRYPTO"; destination="0xDEAD0000" } "p2"
  $c2 = C-Post "$base/api/account/payouts" $jarM $bP2 "$tmp\po2.json"
  $code2 = ""
  try { $code2 = (Get-Content "$tmp\po2.json" -Raw | ConvertFrom-Json).code } catch { }
  Check "request 5000c over balance -> 400 insufficient_balance" (($c2 -eq 400) -and ($code2 -eq "insufficient_balance")) "code=$c2/$code2"
  Check "balance unchanged after rollback" ((Sql "SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId"" = '$mUser';") -eq "1000") ""
  Check "failed request left no payout row (tx rolled back)" ((Sql "SELECT count(*) FROM ""Payout"";") -eq "1") ""
  $bP3 = Json @{ amountCents=0; method="BANK_TRANSFER"; destination="KE-BANK-0011" } "p3"
  Check "amountCents 0 -> 400 validation" ((C-Post "$base/api/account/payouts" $jarM $bP3 "$tmp\po3.json") -eq 400) ""
  $bP4 = Json @{ amountCents=100; method="BANK_TRANSFER"; destination="X" } "p4"
  Check "destination too short -> 400 validation" ((C-Post "$base/api/account/payouts" $jarM $bP4 "$tmp\po4.json") -eq 400) ""

  # ---- auth gates -----------------------------------------------------------
  $jarNone = "$tmp\s6c-none.jar"
  Remove-Item $jarNone -EA SilentlyContinue
  Check "unauthenticated request -> 401" ((C-Post "$base/api/account/payouts" $jarNone $bP4 "$tmp\po5.json") -eq 401) ""
  Check "member cannot PATCH admin payouts -> 401" ((C-Status "PATCH" "$base/api/admin/payouts/$p1" $jarM (Json @{ action="APPROVE" } "m-patch")) -eq 401) ""

  # ---- admin review ---------------------------------------------------------
  $jarA = "$tmp\s6c-admin.jar"
  Remove-Item $jarA -EA SilentlyContinue
  $bAdm = Json @{ email="admin@smoke.local"; password="Smoke-Admin-Pass-1" } "adm"
  Check "SUPER_ADMIN sign-in -> 200" ((C-Post "$base/api/admin/login" $jarA $bAdm "$tmp\alogin.json") -eq 200) ""
  Check "admin payouts page -> 200" ((C-Status "GET" "$base/admin/payouts" $jarA $null) -eq 200) ""

  function A-Action($payoutId, $action, $outName) {
    $b = Json @{ action=$action } $outName
    $body = "$tmp\$outName-body.json"
    $code = & curl.exe -s -o $body -w "%{http_code}" --max-redirs 0 --max-time 60 -X PATCH `
      -b $jarA -c $jarA -H "Content-Type: application/json" --data-binary "@$b" `
      "$base/api/admin/payouts/$payoutId" 2>$null
    return $code
  }

  # review cannot be skipped
  Check "MARK_PAID before approval -> 409" ((A-Action $p1 "MARK_PAID" "a1") -eq 409) ""
  Check "still REQUESTED, balance untouched" (((Sql "SELECT status FROM ""Payout"" WHERE id='$p1';") -eq "REQUESTED") -and ((Sql "SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId"" = '$mUser';") -eq "1000")) ""

  Check "APPROVE -> 200" ((A-Action $p1 "APPROVE" "a2") -eq 200) ""
  Check "status APPROVED with approver recorded" ((Sql "SELECT status||'|'||(""approvedById"" IS NOT NULL)||'|'||(""approvedAt"" IS NOT NULL) FROM ""Payout"" WHERE id='$p1';") -eq "APPROVED|true|true") ""
  Check "APPROVE twice -> 409" ((A-Action $p1 "APPROVE" "a3") -eq 409) ""

  Check "MARK_PAID -> 200" ((A-Action $p1 "MARK_PAID" "a4") -eq 200) ""
  Check "PAID moved NO money (balance still 1000)" ((Sql "SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId"" = '$mUser';") -eq "1000") ""
  Check "exactly one hold ledger row, zero refunds so far" (((Sql "SELECT count(*) FROM ""LedgerEntry"" WHERE ""idempotencyKey"" LIKE 'payout:%:hold';") -eq "1") -and ((Sql "SELECT count(*) FROM ""LedgerEntry"" WHERE ""idempotencyKey"" LIKE 'payout:%:refund';") -eq "0")) ""
  Check "paidAt recorded" ((Sql "SELECT (""paidAt"" IS NOT NULL) FROM ""Payout"" WHERE id='$p1';") -eq "t") ""
  Check "PAID is terminal: MARK_PAID again -> 409" ((A-Action $p1 "MARK_PAID" "a5") -eq 409) ""
  Check "audit rows exist for approve + mark-paid" ((Sql "SELECT count(*) FROM ""AuditLog"" WHERE ""entity""='Payout' AND ""entityId""='$p1';") -eq "2") ""

  # ---- reject refunds the hold ---------------------------------------------
  $bR1 = Json @{ amountCents=800; method="CRYPTO"; destination="0xDEAD0001" } "r1"
  $cR1 = C-Post "$base/api/account/payouts" $jarM $bR1 "$tmp\ro1.json"
  $pr = ""
  try { $pr = (Get-Content "$tmp\ro1.json" -Raw | ConvertFrom-Json).payout.id } catch { }
  Check "request 800c -> 200, balance 200" (($cR1 -eq 200) -and ((Sql "SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId"" = '$mUser';") -eq "200")) "code=$cR1 payout=$pr"

  Check "REJECT from REQUESTED -> 200" ((A-Action $pr "REJECT" "a6") -eq 200) ""
  Check "refund restored balance 200 -> 1000" ((Sql "SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId"" = '$mUser';") -eq "1000") ""
  Check "refund ledger CREDIT/REFUND balanceAfter 1000" ((Sql "SELECT ""direction""||'|'||""type""||'|'||""amountCents""||'|'||""balanceAfterCents""||'|'||""refId"" FROM ""LedgerEntry"" WHERE ""idempotencyKey"" = 'payout:${pr}:refund';") -eq "CREDIT|REFUND|800|1000|$pr") ""
  Check "REJECT again -> 409 (terminal)" ((A-Action $pr "REJECT" "a7") -eq 409) ""
  Check "no double refund: balance still 1000" ((Sql "SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId"" = '$mUser';") -eq "1000") ""

  # ---- reject after approval is legal (change of mind) ----------------------
  $bR2 = Json @{ amountCents=400; method="WALLET"; destination="member-wallet" } "r2"
  $cR2 = C-Post "$base/api/account/payouts" $jarM $bR2 "$tmp\ro2.json"
  $ps = ""
  try { $ps = (Get-Content "$tmp\ro2.json" -Raw | ConvertFrom-Json).payout.id } catch { }
  Check "request 400c -> 200, balance 600" (($cR2 -eq 200) -and ((Sql "SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId"" = '$mUser';") -eq "600")) "payout=$ps"
  Check "APPROVE 400c -> 200" ((A-Action $ps "APPROVE" "a8") -eq 200) ""
  Check "REJECT after APPROVE -> 200 (legal)" ((A-Action $ps "REJECT" "a9") -eq 200) ""
  Check "balance restored to 1000" ((Sql "SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId"" = '$mUser';") -eq "1000") ""
  Check "its refund balanceAfter 1000" ((Sql "SELECT ""direction""||'|'||""type""||'|'||""amountCents""||'|'||""balanceAfterCents"" FROM ""LedgerEntry"" WHERE ""idempotencyKey"" = 'payout:${ps}:refund';") -eq "CREDIT|REFUND|400|1000") ""

  # ---- final state, member-visible surfaces, filter -------------------------
  $summary = Sql "SELECT status||'|'||count(*) FROM ""Payout"" GROUP BY status ORDER BY status;"
  $sumLines = @($summary -split "`r?`n" | Where-Object { $_ -ne "" })
  Check "final payout set: exactly PAID|1 + REJECTED|2" (($sumLines.Count -eq 2) -and ($sumLines -contains "PAID|1") -and ($sumLines -contains "REJECTED|2")) ($sumLines -join " / ")
  Check "total debits = total refunds on the hold ledger" (((Sql "SELECT sum(""amountCents"") FROM ""LedgerEntry"" WHERE ""idempotencyKey"" LIKE 'payout:%:hold';") -eq "2200") -and ((Sql "SELECT sum(""amountCents"") FROM ""LedgerEntry"" WHERE ""idempotencyKey"" LIKE 'payout:%:refund';") -eq "1200")) ""

  C-Status "GET" "$base/dashboard/transactions" $jarM $null "$tmp\tx.html" | Out-Null
  $txHtml = Get-Content "$tmp\tx.html" -Raw -ErrorAction SilentlyContinue
  Check "transactions page shows Withdrawal + Refund" (($txHtml -match "Withdrawal") -and ($txHtml -match "Refund")) ""
  Check "admin filter PAID -> 200" ((C-Status "GET" "$base/admin/payouts?status=PAID" $jarA $null) -eq 200) ""
  Check "member nav links to /dashboard/payouts" (((C-Status "GET" "$base/dashboard" $jarM $null "$tmp\dash.html") -eq 200) -and ((Get-Content "$tmp\dash.html" -Raw) -match "/dashboard/payouts")) ""
  Check "admin nav links to /admin/payouts" (((C-Status "GET" "$base/admin" $jarA $null "$tmp\adm.html") -eq 200) -and ((Get-Content "$tmp\adm.html" -Raw) -match "/admin/payouts")) ""
}
finally {
  if ($proc) { try { Stop-Process -Id $proc.Id -Force -EA SilentlyContinue } catch { } }
  if (-not (Free-Port $port)) {
    foreach ($procId in (netstat -ano | Select-String ":$port\s+.*LISTENING" | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique)) {
      try { Stop-Process -Id ([int]$procId) -Force -EA SilentlyContinue } catch { }
    }
  }
  Pop-Location
}

$footer = "==== RESULT: $($script:pass) passed, $($script:fail) failed ===="
Write-Host $footer; Add-Content -LiteralPath $transcript -Value $footer
exit $(if ($script:fail -gt 0) { 1 } else { 0 })
