# GTHubX Phase 6b live smoke: rank milestones on settlement.
# Proves, against the database, that ONE confirm produces all three outcomes:
#   A   Associate rank 1  pool-covered  -> PAID $14 (+ wallet + ledger + pool debit)
#   S1  Leadership rank 1 SKU          -> PENDING SMARTPHONE (no money)
#   S2  Associate rank 1  pool short   -> FLAGGED $14 (NO money moves)
#   M3  Associate rank 1  pool short   -> FLAGGED $14 (second flagger - Phase 6d
#                                        clears one and rejects the other)
# Zero HTTP registrations: the fixture pre-creates the tree and the PENDING
# payment, so this harness never fights the 5/hour/IP register rate limit.
# curl.exe is the record (lesson 193); SQL goes through files and PowerShell
# escapes double quotes by DOUBLING them (lessons 188 / 207). Filtered
# single-row results are wrapped in @() (lesson 211). Interpolations that are
# followed by ':' use ${var} braces (lesson 216).
#
# Lives IN THE REPO: the shared temp dir deletes harness files between
# sessions (phase5/6/6b scripts all vanished) - a smoke script is project
# tooling, not a scratch file.
$ErrorActionPreference = "Continue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$port = 3500
$tmp = "C:\Users\PC\AppData\Local\Temp\opencode"
$transcript = "$tmp\gthubx-phase6b-results.txt"
$outLog = "$tmp\gthubx-phase6b-dev.out.log"
$errLog = "$tmp\gthubx-phase6b-dev.err.log"
$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
Set-Content -LiteralPath $transcript -Value "==== PHASE 6b SMOKE $(Get-Date -Format s) ====" -Encoding UTF8
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
function Json($obj, $name) {
  $f = "$tmp\b-$name-$([guid]::NewGuid().ToString('N').Substring(0,6)).json"
  $obj | ConvertTo-Json -Compress | Set-Content -LiteralPath $f -Encoding UTF8
  return $f
}
function C-Post($url, $jar, $bodyFile, $out) {
  $a = @("-s","-o",$out,"-w","%{http_code}","--max-redirs","0","--max-time","60","-X","POST",
         "-H","Content-Type: application/json","--data-binary","@$bodyFile",$url)
  if ($jar) { $a += @("-b",$jar,"-c",$jar) }
  return (& curl.exe @a 2>$null)
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
  # ---- fixture: tree + PENDING payment, deterministic baseline --------------
  $fixOut = "$tmp\gthubx-fixture-out.txt"
  & pnpm db:seed:rank-fixture 2>&1 | Out-File -LiteralPath $fixOut -Encoding utf8
  $fixText = Get-Content $fixOut -Raw -ErrorAction SilentlyContinue
  $paymentId = ""
  if ($fixText -match 'NEWCOMER_PAYMENT=(\S+)') { $paymentId = $Matches[1] }
  Check "rank fixture built (payment handed over)" (NonEmpty $paymentId) "payment=$paymentId"
  if (-not $paymentId) { Pop-Location; exit 1 }

  $idA   = Sql "SELECT id FROM ""User"" WHERE email = 'A@rank-fixture.test';"
  $idS1  = Sql "SELECT id FROM ""User"" WHERE email = 'S1@rank-fixture.test';"
  $idS2  = Sql "SELECT id FROM ""User"" WHERE email = 'S2@rank-fixture.test';"
  $idA1  = Sql "SELECT id FROM ""User"" WHERE email = 'a1@rank-fixture.test';"
  $idM3  = Sql "SELECT id FROM ""User"" WHERE email = 'M3@rank-fixture.test';"
  Check "fixture users resolvable" ((NonEmpty $idA) -and (NonEmpty $idS1) -and (NonEmpty $idS2) -and (NonEmpty $idA1) -and (NonEmpty $idM3)) "A=$idA S1=$idS1 S2=$idS2 M3=$idM3"
  Check "pool baseline is 1800, zero awards exist" (((Sql "SELECT ""accruedCents""||'|'||""paidCents"" FROM ""BonusPool"" WHERE kind='RANK';") -eq "1800|0") -and ((Sql "SELECT count(*) FROM ""RankAward"";") -eq "0")) ((Sql "SELECT ""accruedCents""||'|'||""paidCents"" FROM ""BonusPool"" WHERE kind='RANK';"))

  # ---- start app (free the port first, or next dev silently takes another
  #      port and every assertion below would run against STALE code) ---------
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

  # ---- confirm the fixture payment as SUPER_ADMIN ---------------------------
  $jarSuper = "$tmp\s6b-super.jar"
  Remove-Item $jarSuper -EA SilentlyContinue
  $bAdm = Json @{ email="admin@smoke.local"; password="Smoke-Admin-Pass-1" } "adm"
  Check "SUPER_ADMIN sign-in -> 200" ((C-Post "$base/api/admin/login" $jarSuper $bAdm "$tmp\login.json") -eq 200) ""

  $bC = Json @{} "cf"
  $cc = & curl.exe -s -o "$tmp\confirm.json" -w "%{http_code}" --max-redirs 0 --max-time 60 -X PATCH `
    -b $jarSuper -c $jarSuper -H "Content-Type: application/json" --data-binary "@$bC" `
    "$base/api/admin/payments/$paymentId" 2>$null
  Check "confirm fixture payment -> 200" ($cc -eq 200) "code=$cc"

  # ---- the response states the plan outcome ---------------------------------
  # NB: wrap the WHERE result in @() — in PS 5.1 a filtered single
  # PSCustomObject has no reliable .Count, so bare `.Count -eq 1` lies.
  $conf = $null
  try { $conf = Get-Content "$tmp\confirm.json" -Raw | ConvertFrom-Json } catch { }
  $paidList  = @(); $flagList = @(); $skuList = @()
  if ($conf -and $conf.settlement.rankAwards) {
    $paidList  = @($conf.settlement.rankAwards.paid)
    $flagList  = @($conf.settlement.rankAwards.flagged)
    $skuList   = @($conf.settlement.rankAwards.skus)
  }
  $nPaidA  = @($paidList  | Where-Object { $_.userId -eq $idA  -and $_.rewardCents -eq 1400 }).Count
  $nFlagS2 = @($flagList  | Where-Object { $_.userId -eq $idS2 }).Count
  $nFlagM3 = @($flagList  | Where-Object { $_.userId -eq $idM3 }).Count
  $nSkuS1  = @($skuList   | Where-Object { $_.userId -eq $idS1 -and $_.rewardSku -eq "SMARTPHONE" }).Count
  Check "response: A paid 1400"  ($nPaidA -eq 1)  (($paidList | ConvertTo-Json -Compress))
  Check "response: S2 flagged"   ($nFlagS2 -eq 1) (($flagList | ConvertTo-Json -Compress))
  Check "response: M3 flagged"   ($nFlagM3 -eq 1) (($flagList | ConvertTo-Json -Compress))
  Check "response: S1 SKU"       ($nSkuS1 -eq 1)  (($skuList  | ConvertTo-Json -Compress))
  Check "response: pool paid 1400, available 800" (($conf.settlement.rankAwards.paidCents -eq 1400) -and ($conf.settlement.rankAwards.poolAvailableCents -eq 800)) "paid=$($conf.settlement.rankAwards.paidCents) avail=$($conf.settlement.rankAwards.poolAvailableCents)"

  # ---- RankAward rows: exactly four (M3 joined the tree for 6d) -------------
  $awardCount = Sql "SELECT count(*) FROM ""RankAward"";"
  Check "exactly 4 RankAward rows" ($awardCount -eq "4") "count=$awardCount"
  $aAward = Sql "SELECT kind||'|'||""rankId""||'|'||""rewardCents""||'|'||status||'|'||(CASE WHEN ""paidAt"" IS NULL THEN 'nopaid' ELSE 'paid' END) FROM ""RankAward"" WHERE ""userId""='$idA';"
  Check "A: ASSOCIATE|1|1400|PAID|paid" ($aAward -eq "ASSOCIATE|1|1400|PAID|paid") "got=$aAward"
  $s2Award = Sql "SELECT kind||'|'||""rankId""||'|'||""rewardCents""||'|'||status||'|'||(CASE WHEN ""paidAt"" IS NULL THEN 'nopaid' ELSE 'paid' END) FROM ""RankAward"" WHERE ""userId""='$idS2';"
  Check "S2: ASSOCIATE|1|1400|FLAGGED|nopaid" ($s2Award -eq "ASSOCIATE|1|1400|FLAGGED|nopaid") "got=$s2Award"
  $s1Award = Sql "SELECT kind||'|'||""rankId""||'|'||COALESCE(""rewardCents""::text,'null')||'|'||COALESCE(""rewardSku"",'null')||'|'||status FROM ""RankAward"" WHERE ""userId""='$idS1';"
  Check "S1: LEADERSHIP|1|null|SMARTPHONE|PENDING" ($s1Award -eq "LEADERSHIP|1|null|SMARTPHONE|PENDING") "got=$s1Award"
  $m3Award = Sql "SELECT kind||'|'||""rankId""||'|'||""rewardCents""||'|'||status FROM ""RankAward"" WHERE ""userId""='$idM3';"
  Check "M3: ASSOCIATE|1|1400|FLAGGED (second flagger)" ($m3Award -eq "ASSOCIATE|1|1400|FLAGGED") "got=$m3Award"
  $dupes = Sql "SELECT count(*) FROM (SELECT ""userId"",kind,""rankId"" FROM ""RankAward"" GROUP BY 1,2,3 HAVING count(*)>1) d;"
  Check "no duplicate awards (unique index enforced)" ($dupes -eq "0") "dupes=$dupes"

  # ---- money: exactly one milestone moved anything --------------------------
  $milestone = Sql "SELECT count(*)||'|'||COALESCE(sum(""amountCents""),0)||'|'||min(status)||'|'||COALESCE(min(pool::text),'null') FROM ""Commission"" WHERE type='RANK_MILESTONE';"
  Check "exactly one RANK_MILESTONE commission, 1400, PAID, pool RANK" ($milestone -eq "1|1400|PAID|RANK") "got=$milestone"
  $s2Comm = Sql "SELECT count(*) FROM ""Commission"" WHERE ""userId""='$idS2' AND type='RANK_MILESTONE';"
  Check "flagged S2 got NO milestone commission" ($s2Comm -eq "0") "count=$s2Comm"

  # ---- wallets (direct 1500 / gen 200 / 100 / 75 + rank 1400 on A) ---------
  $walA1  = Sql "SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId""='$idA1';"
  $walA   = Sql "SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId""='$idA';"
  $walS1  = Sql "SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId""='$idS1';"
  $walS2  = Sql "SELECT ""balanceCents"" FROM ""Wallet"" WHERE ""userId""='$idS2';"
  Check "a1 wallet = 1500 (direct only)" ($walA1 -eq "1500") "got=$walA1"
  Check "A wallet = 1600 (gen 200 + rank 1400)" ($walA -eq "1600") "got=$walA"
  Check "S1 wallet = 100 (generation only - SKU pays nothing)" ($walS1 -eq "100") "got=$walS1"
  Check "S2 wallet = 75 (generation only - flagged rank pays nothing)" ($walS2 -eq "75") "got=$walS2"

  $ledger = Sql "SELECT ""amountCents""||'|'||""balanceAfterCents""||'|'||""refType"" FROM ""LedgerEntry"" WHERE ""userId""='$idA' AND ""refType""='RANK_AWARD';"
  Check "A ledger RANK_AWARD credit 1400, balanceAfter 1600" ($ledger -eq "1400|1600|RANK_AWARD") "got=$ledger"

  # ---- pool: debited once, never insolvent ----------------------------------
  $pool = Sql "SELECT ""accruedCents""||'|'||""paidCents"" FROM ""BonusPool"" WHERE kind='RANK';"
  Check "pool accrued 2200 (1800 baseline + 400), paid 1400" ($pool -eq "2200|1400") "got=$pool"
  $poolRow = Sql "SELECT ""accruedCents"" - ""paidCents"" FROM ""BonusPool"" WHERE kind='RANK';"
  $poolOk = $false
  if ($poolRow -match '^\d+$') { $poolOk = ([int]$poolRow -ge 0) }
  Check "pool never goes insolvent (available 800 >= 0)" $poolOk "available=$poolRow"
  $poolEntry = Sql "SELECT ""entryType""||'|'||""amountCents""||'|'||""balanceAfterCents""||'|'||""refType"" FROM ""PoolLedgerEntry"" WHERE kind='RANK' AND ""entryType""='PAYOUT';"
  Check "pool ledger PAYOUT 1400, balanceAfter 800, ref RANK_AWARD" ($poolEntry -eq "PAYOUT|1400|800|RANK_AWARD") "got=$poolEntry"

  # ---- rank write-back (flagged still promotes) -----------------------------
  $ranks = Sql "SELECT (SELECT ""highestAssociateRank"" FROM ""User"" WHERE id='$idA')||'|'||(SELECT ""highestAssociateRank"" FROM ""User"" WHERE id='$idS2')||'|'||(SELECT ""highestAssociateRank"" FROM ""User"" WHERE id='$idS1')||'|'||(SELECT ""highestLeadershipRank"" FROM ""User"" WHERE id='$idS1');"
  Check "ranks written: A=1, S2=1 (flagged still promotes), S1=3/1" ($ranks -eq "1|1|3|1") "got=$ranks"

  # ---- 6a behavior still intact + no re-settle ------------------------------
  $p6a = Sql "SELECT p.status||'|'||(SELECT status FROM ""PlatformFee"" WHERE ""paymentId""='$paymentId')||'|'||(SELECT count(*) FROM ""Commission"" WHERE ""sourceUserId""=(SELECT ""userId"" FROM ""Payment"" WHERE id='$paymentId') AND type='DIRECT_REFERRAL_BONUS') FROM ""Payment"" p WHERE p.id='$paymentId';"
  Check "payment PAID, platform fee SETTLED, direct bonus still paid" ($p6a -eq "PAID|SETTLED|1") "got=$p6a"
  $cc2 = & curl.exe -s -o "$tmp\confirm2.json" -w "%{http_code}" --max-redirs 0 --max-time 60 -X PATCH `
    -b $jarSuper -c $jarSuper -H "Content-Type: application/json" --data-binary "@$bC" `
    "$base/api/admin/payments/$paymentId" 2>$null
  Check "double confirm -> 409 (awards cannot re-run)" ($cc2 -eq 409) "code=$cc2"
  Check "award count still 4 after re-confirm attempt" ((Sql "SELECT count(*) FROM ""RankAward"";") -eq "4") ""

  # ---- PUBLIC REPORT: the admin surface must show the flagged state ---------
  $page = "$tmp\payments-page.html"
  $cp = & curl.exe -s -o $page -w "%{http_code}" --max-redirs 0 --max-time 60 -b $jarSuper -c $jarSuper "$base/admin/payments" 2>$null
  Check "/admin/payments -> 200" ($cp -eq 200) "code=$cp"
}
finally {
  Pop-Location
  if ($proc) { try { Stop-Process -Id $proc.Id -Force -EA SilentlyContinue } catch { } }
  Free-Port $port | Out-Null
}

$line = "==== PHASE 6b SMOKE: $script:pass passed, $($script:fail) failed ===="
Write-Host $line; Add-Content -LiteralPath $transcript -Value $line
exit $(if ($script:fail -gt 0) { 1 } else { 0 })
