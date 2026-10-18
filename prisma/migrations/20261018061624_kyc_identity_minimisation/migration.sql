-- Phase 7d: identity minimisation.
--
-- A document number is sensitive personal information under the Data Privacy
-- Act (RA 10173 s.3(l)(3) - identifiers issued by government agencies), and a
-- plaintext copy of one is a liability with no matching benefit. Verification
-- is a point-in-time act: it needs the number to CHECK, not to KEEP.
--
-- So the raw column goes, and two derived ones take its place:
--   idNumberHash   HMAC-SHA256 keyed with KYC_ID_PEPPER. Dedup only, and
--                  unusable without the key. A bare SHA-256 of a 9-digit
--                  number is enumerable, which is not protection.
--   idNumberLast4  the human reference a reviewer or support agent matches on.
--
-- Existing rows keep their last four digits (backfilled below). Their hash is
-- left null on purpose: it cannot be recomputed here because the key is not in
-- the database, and writing an unkeyed digest would be worse than nothing.

ALTER TABLE "KycProfile" ADD COLUMN "idNumberHash" TEXT;
ALTER TABLE "KycProfile" ADD COLUMN "idNumberLast4" TEXT;

UPDATE "KycProfile"
SET "idNumberLast4" = upper(right(btrim("idNumber"), 4))
WHERE "idNumber" IS NOT NULL
  AND length(btrim("idNumber")) >= 4;

ALTER TABLE "KycProfile" DROP COLUMN "idNumber";