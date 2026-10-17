-- One award per member per rank, enforced by the database. Settlement runs on
-- every registration confirm, so the writer's check-then-insert needs an
-- independent backstop: a double-paid milestone would be unrecoverable.
-- RankAward was empty at migration time (verified), so no dedupe needed.
CREATE UNIQUE INDEX "RankAward_userId_kind_rankId_key" ON "RankAward"("userId", "kind", "rankId");