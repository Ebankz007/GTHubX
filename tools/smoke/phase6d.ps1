# GTHubX Phase 6d live smoke: flagged rank-award admin flow.
# The rank fixture now produces TWO flaggers (S2 and M3) and three PENDING
# payments. This harness proves, end to end:
#   - a flagged award REFUSES to pay while the pool is short (409 pool_short,
#     nothing written) - twice, as the pool climbs;
#   - after enough registrations accrue, MARK_PAID clears it from the pool
#     with the exact automatic-path shape (commission + wallet + pool debit);
#   - REJECT closes the other flagger with NO money moved, keeping its rank;
#   - PAID and REJECTED are terminal (409s), audits exist, count stays 4.
# curl.exe is the record (lesson 193); SQL doubles quotes (188/207); single-row
# filters wrapped in @() (211); colon-following interpolations use ${} (216).
$ErrorActionPreference = "Continue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$port = 3500
$tmp = "C:\Users\PC\AppData\Local\Temp\opencode"
$transcript = "$tmp\gthubx-phase6d-results.txt"
$outLog = "$tmp\gthubx-phase6d-dev.out.log"
$errLog = "$tmp\gthubx-phase6d-dev.err.log"
$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
Set-Content -LiteralPath $transcript -Value "==== PHASE 6d SMOKE $(Get-Date -Format s) ====" -Encoding UTF8
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

$proc = $null
try {
  # ---- fixture: two flaggers + three PENDING payments -----------------------
  $fixOut = "$tmp\gthubx-fixture-out.txt"
  & pnpm db:seed:rank-fixture 2>&1 | Out-File -LiteralPath $fixOut -Encoding utf8
  $fixText = Get-Content $fixOut -Raw -ErrorAction SilentlyContinue
  $pay1 = ""; $pay2 = ""; $pay3 = ""
  if ($fixText -match 'NEWCOMER_PAYMENT=(\S+)')  { $pay1 = $Matches[1] }
  if ($fixText -match 'NEWCOMER2_PAYMENT=(\S+)') { $pay2 = $Matches[1] }
  if ($fixText -match 'NEWCOMER3_PAYMENT=(\S+)') { $pay3 = $Matches[1] }
  Check "fixture handed over three payments" ((NonEmpty $pay1) -and (NonEmpty $pay2) -and (NonEmpty $pay3)) "p1=$pay1 p2=$pay2 p3=$pay3"
  if (-not $pay3) { Pop-Location; exit 1 }

  $idS2 = Sql "SELECT id FROM ""User"" WHERE email = 'S2@rank-fixture.test';"
  $idM3 = Sql "SELECT id FROM ""User"" WHERE email = 'M3@rank-fixture.test';"
  Check "flaggers resolvable" ((NonEmpty $idS2) -and (NonEmpty $idM3)) "S2=$idS2 M3=$idM3"

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

  # ---- admin session --------------------------------------------------------
  $jarA = "$tmp\s6d-admin.jar"
  Remove-Item $jarA -EA SilentlyContinue
  $bAdm = Json @{ email="admin@smoke.local"; password="Smoke-Admin-Pass-1" } "adm"
  Check "SUPER_ADMIN sign-in -> 200" ((C-Post "$base/api/admin/login" $jarA $bAdm "$tmp\login.json") -eq 200) ""
  Check "rank-awards page -> 200" ((C-Status "GET" "$base/admin/rank-awards" $jarA $null) -eq 200) ""

  function Confirm($paymentId, $tag) {
    $b = Json @{} "cf-$tag"
    return & curl.exe -s -o "$tmp\confirm-$tag.json" -w "%{http_code}" --max-redirs 0 --max-time 60 -X PATCH `
      -b $jarA -c $jarA -H "Content-Type: application/json" --data-binary "@$b" `
      "$base/api/admin/payments/$paymentId" 2>$null
  }
  function Award-Action($awardId, $action, $tag) {
    $b = Json @{ action=$action } "aa-$tag"
    $body = "$tmp\aa-$tag-body.json"
    $code = & curl.exe -s -o $body -w "%{http_code}" --max-redirs 0 --max-time 60 -X PATCH `
      -b $jarA -c $jarA -H "Content-Type: application/json" --data-binary "@$b" `
      "$base/api/admin/rank-awards/$awardId" 2>$null
    return $code
  }

  # ---- confirm #1: the three-outcome split, pool short for both flaggers ---
  Check "confirm #1 -> 200" ((Confirm $pay1 "1") -eq 200) ""
  $awS2 = Sql "SELECT id FROM ""RankAward"" WHERE ""userId""='$idS2' AND kind='ASSOCIATE';"
  $awM3 = Sql "SELECT id FROM ""RankAward"" WHERE ""userId""='$idM3' AND kind='ASSOCIATE';"
  Check "two flagged award rows exist" ((NonEmpty $awS2) -and (NonEmpty $awM3)) "S2=$awS2 M3=$awM3"
  Check "pool after #1: 2200 accrued | 1400 paid (avail 800)" ((Sql "SELECT ""accruedCents""||'|'||""paidCents"" FROM ""BonusPool"" WHERE kind='RANK';") -eq "2200|1400") ""

  # ---- short pool refuses, twice, writing NOTHING ---------------------------
  Check "MARK_PAID S2 while short -> 409 pool_short" ((Award-Action $awS2 "MARK_PAID" "short1") -eq 409) ""
  Check "code=pool_short, award still FLAGGED, pool untouched" (((Get-Content "$tmp\aa-short1-body.json" -Raw | ConvertFrom-Json).code -eq "pool_short") -and ((Sql "SELECT status FROM ""RankAward"" WHERE id='$awS2';") -eq "FLAGGED") -and ((Sql "SELECT ""accruedCents""||'|'||""paidCents"" FROM ""BonusPool"" WHERE kind='RANK';") -eq "2200|1400")) ""
  Check "no commission, no ledger, no pool entry from the refusal" (((Sql "SELECT count(*) FROM ""Commission"" WHERE ""userId""='$idS2' AND type='RANK_MILESTONE';") -eq "0") -and ((Sql "SELECT count(*) FROM ""LedgerEntry"" WHERE ""refType""='RANK_AWARD' AND ""refId""='$awS2';") -eq "0") -and ((Sql "SELECT count(*) FROM ""PoolLedgerEntry"" WHERE ""refId""='$awS2';") -eq "0")) ""

  Check "confirm #2 -> 200 (pool 2600|1400, still short)" (((Confirm $pay2 "2") -eq 200) -and ((Sql "SELECT ""accruedCents""||'|'||""paidCents"" FROM ""BonusPool"" WHERE kind='RANK';") -eq "2600|1400")) ""
  Check "MARK_PAID S2 still short -> 409 again" ((Award-Action $awS2 "MARK_PAID" "short2") -eq 409) ""

  # ---- confirm #3 covers it; MARK_PAID clears from the pool ----------------
  Check "confirm #3 -> 200 (pool 3000|1400, avail 1600 >= 1400)" (((Confirm $pay3 "3") -eq 200) -and ((Sql "SELECT ""accruedCents""||'|'||""paidCents"" FROM ""BonusPool"" WHERE kind='RANK';") -eq "3000|1400")) ""
  Check "MARK_PAID S2 -> 200 PAID, paidCents 1400, avail 200" ((Award-Action $awS2 "MARK_PAID" "pay") -eq 200) ""
  $payBody = $null
  try { $payBody = Get-Content "$tmp\aa-pay-body.json" -Raw | ConvertFrom-Json } catch { }
  Check "response states PAID | 1400 | 200" (($payBody.status -eq "PAID") -and ($payBody.paidCents -eq 1400) -and ($payBody.poolAvailableCents -eq 200)) (($payBody | ConvertTo-Json -Compress))
  Check "S2 award row: PAID with paidAt" ((Sql "SELECT status||'|'||(""paidAt"" IS NOT NULL) FROM ""RankAward"" WHERE id='$awS2';") -eq "PAID|true") ""

  # ---- the pay mirrors the automatic path exactly ---------------------------
  $comm = Sql "SELECT count(*)||'|'||COALESCE(sum(""amountCents""),0)||'|'||min(status)||'|'||COALESCE(min(pool::text),'null') FROM ""Commission"" WHERE type='RANK_MILESTONE';"
  Check "two RANK_MILESTONE commissions, 2800 total, PAID, pool RANK" ($comm -eq "2|2800|PAID|RANK") "got=$comm"
  $ledS2 = Sql "SELECT ""amountCents""||'|'||""balanceAfterCents""||'|'||""refType"" FROM ""LedgerEntry"" WHERE ""userId""='$idS2' AND ""refType""='RANK_AWARD';"
  Check "S2 ledger: 1400 credit, balanceAfter 1625, RANK_AWARD" ($ledS2 -eq "1400|1625|RANK_AWARD") "got=$ledS2"
  Check "S2 wallet = 1625 (3x gen 75 + milestone 1400)" ((Sql "SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId""='$idS2';") -eq "1625") ""
  Check "pool 3000|2800, its PAYOUT entry balanceAfter 200" (((Sql "SELECT ""accruedCents""||'|'||""paidCents"" FROM ""BonusPool"" WHERE kind='RANK';") -eq "3000|2800") -and ((Sql "SELECT ""entryType""||'|'||""amountCents""||'|'||""balanceAfterCents""||'|'||""refId"" FROM ""PoolLedgerEntry"" WHERE kind='RANK' AND ""refId""='$awS2';") -eq "PAYOUT|1400|200|$awS2")) ""
  Check "pool never negative (avail 200 >= 0)" (([int](Sql "SELECT ""accruedCents"" - ""paidCents"" FROM ""BonusPool"" WHERE kind='RANK';")) -ge 0) ""
  Check "audit row exists for the mark-paid" ((Sql "SELECT count(*) FROM ""AuditLog"" WHERE ""entity""='RankAward' AND ""entityId""='$awS2' AND action='rank-award.mark-paid';") -eq "1") ""

  # ---- terminal states ------------------------------------------------------
  Check "MARK_PAID PAID again -> 409" ((Award-Action $awS2 "MARK_PAID" "term1") -eq 409) ""
  Check "REJECT a PAID award -> 409" ((Award-Action $awS2 "REJECT" "term2") -eq 409) ""

  # ---- the other flagger: still short -> REJECT closes it, no money ---------
  Check "MARK_PAID M3 (avail 200 < 1400) -> 409 pool_short" (((Award-Action $awM3 "MARK_PAID" "short3") -eq 409) -and ((Get-Content "$tmp\aa-short3-body.json" -Raw | ConvertFrom-Json).code -eq "pool_short")) ""
  Check "REJECT M3 -> 200 REJECTED" ((Award-Action $awM3 "REJECT" "rej") -eq 200) ""
  Check "M3 award REJECTED, wallet untouched at 225 (3x gen 75)" (((Sql "SELECT status FROM ""RankAward"" WHERE id='$awM3';") -eq "REJECTED") -and ((Sql "SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId""='$idM3';") -eq "225")) ""
  Check "reject moved NO money: no ledger, no commission, no pool entry" (((Sql "SELECT count(*) FROM ""LedgerEntry"" WHERE ""refType""='RANK_AWARD' AND ""refId""='$awM3';") -eq "0") -and ((Sql "SELECT count(*) FROM ""Commission"" WHERE ""userId""='$idM3' AND type='RANK_MILESTONE';") -eq "0") -and ((Sql "SELECT count(*) FROM ""PoolLedgerEntry"" WHERE ""refId""='$awM3';") -eq "0")) ""
  Check "reject does NOT demote: M3 highestAssociateRank stays 1" ((Sql "SELECT ""highestAssociateRank"" FROM ""User"" WHERE id='$idM3';") -eq "1") ""
  Check "audit row exists for the reject" ((Sql "SELECT count(*) FROM ""AuditLog"" WHERE ""entity""='RankAward' AND ""entityId""='$awM3' AND action='rank-award.reject';") -eq "1") ""
  Check "REJECT again -> 409 (terminal)" ((Award-Action $awM3 "REJECT" "term3") -eq 409) ""

  # ---- global invariants + surfaces ------------------------------------------
  Check "still exactly 4 RankAward rows (no re-awards across 3 settles)" ((Sql "SELECT count(*) FROM ""RankAward"";") -eq "4") ""
  Check "final split: A+S2 PAID, M3 REJECTED, S1 PENDING" ((Sql "SELECT count(*) FROM ""RankAward"" WHERE status='PAID';") -eq "2") ((Sql "SELECT status||'|'||count(*) FROM ""RankAward"" GROUP BY status ORDER BY status;"))
  Check "wallets: a1=4500, A=2000, S1=300, S2=1625, M3=225" ((Sql "SELECT (SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId""=(SELECT id FROM ""User"" WHERE email='a1@rank-fixture.test'))||'|'||(SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId""=(SELECT id FROM ""User"" WHERE email='A@rank-fixture.test'))||'|'||(SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId""=(SELECT id FROM ""User"" WHERE email='S1@rank-fixture.test'))||'|'||(SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId""='$idS2')||'|'||(SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId""='$idM3');") -eq "4500|2000|300|1625|225") ""
  Check "ranks unchanged: A=1, S2=1, S1=3/1, M3=1" ((Sql "SELECT (SELECT ""highestAssociateRank"" FROM ""User"" WHERE email='A@rank-fixture.test')||'|'||(SELECT ""highestAssociateRank"" FROM ""User"" WHERE id='$idS2')||'|'||(SELECT ""highestAssociateRank"" FROM ""User"" WHERE email='S1@rank-fixture.test')||'|'||(SELECT ""highestLeadershipRank"" FROM ""User"" WHERE email='S1@rank-fixture.test')||'|'||(SELECT ""highestAssociateRank"" FROM ""User"" WHERE id='$idM3');") -eq "1|1|3|1|1") ""
  Check "rank-awards filter FLAGGED -> 200" ((C-Status "GET" "$base/admin/rank-awards?status=FLAGGED" $jarA $null) -eq 200) ""
  Check "admin nav links to /admin/rank-awards" (((C-Status "GET" "$base/admin" $jarA $null "$tmp\adm.html") -eq 200) -and ((Get-Content "$tmp\adm.html" -Raw) -match "/admin/rank-awards")) ""
}
finally {
  Pop-Location
  if ($proc) { try { Stop-Process -Id $proc.Id -Force -EA SilentlyContinue } catch { } }
  Free-Port $port | Out-Null
}

$line = "==== PHASE 6d SMOKE: $($script:pass) passed, $($script:fail) failed ===="
Write-Host $line; Add-Content -LiteralPath $transcript -Value $line
exit $(if ($script:fail -gt 0) { 1 } else { 0 })
