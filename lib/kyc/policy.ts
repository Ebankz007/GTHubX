/**
 * GTHubX — identity-verification policy (Phase 7c).
 *
 * This is the **one editable home** of the KYC rules: which document types we
 * accept, which documents a member must be able to produce, how old they must
 * be, and how long the free-text fields may be. A compliance change should be a
 * change to this file and nothing else.
 *
 * ---------------------------------------------------------------------------
 * What this module deliberately does NOT decide: where document *files* live.
 *
 * `DOCUMENTS_UPLOAD_ENABLED` is `false`, and that is a decision, not an
 * oversight. Storing passport scans means encryption at rest, per-object access
 * control, a retention and deletion schedule, and a breach-exposure answer —
 * that is a PII posture with legal weight, and it is Henry's call, not the
 * code's. So the pipeline below is real and complete *without* the bytes: a
 * member submits the facts, a reviewer decides, the status moves, the member is
 * told. When the storage decision lands, the upload path slots in behind
 * `documentPolicy()` and nothing else in this phase changes shape.
 *
 * Building a `public/uploads/` folder for identity documents "temporarily"
 * would be the single worst thing this phase could do. It is exactly how a
 * temporary liability becomes a permanent one.
 * ---------------------------------------------------------------------------
 *
 * What this module DOES decide, as of Phase 7d: how little of the member's
 * identity we keep. The document *number* is no longer stored at all - only a
 * keyed digest (dedup) and the last four characters (human reference). See
 * `lib/kyc/identity.ts`. And identity fields are not kept forever: see
 * `IDENTITY_RETENTION_DAYS` below.
 *
 * The eventual target for verification itself is to delegate the *check* to an
 * identity provider and keep only its verdict plus a reference - the platform
 * would then hold no identity document and no identity number, only the fact
 * and the date. That is a change of *decider*, not of data model: the status
 * machine, the audit trail, the withdrawal gate and this module's shape all
 * stay exactly as they are, and `documentPolicy()` already reports whether
 * bytes are collected. No placeholder mode constant is defined for it here,
 * because a configuration value with one reachable value is not a seam - it is
 * decoration.
 * ---------------------------------------------------------------------------
 */

/** Document types a member may present. Adding one is a policy change. */
export const ID_TYPE_IDS = [
  "PASSPORT",
  "NATIONAL_ID",
  "DRIVERS_LICENSE",
  "RESIDENCE_PERMIT",
] as const;

export type IdType = (typeof ID_TYPE_IDS)[number];

export type IdTypeInfo = {
  readonly id: IdType;
  readonly label: string;
  readonly hint: string;
};

export const ID_TYPES: readonly IdTypeInfo[] = [
  {
    id: "PASSPORT",
    label: "Passport",
    hint: "The photo page, including the machine-readable strip.",
  },
  {
    id: "NATIONAL_ID",
    label: "National identity card",
    hint: "Both sides if the back carries information.",
  },
  {
    id: "DRIVERS_LICENSE",
    label: "Driving licence",
    hint: "Both sides. A provisional licence is not accepted.",
  },
  {
    id: "RESIDENCE_PERMIT",
    label: "Residence permit",
    hint: "The permit card plus the page showing its validity.",
  },
];

export function isIdType(value: unknown): value is IdType {
  return (
    typeof value === "string" && (ID_TYPE_IDS as readonly string[]).includes(value)
  );
}

/** Human label for a stored `idType`, falling back to the raw value. */
export function idTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return ID_TYPES.find((t) => t.id === value)?.label ?? value;
}

/**
 * The documents a member is asked to have ready. The review queue shows this
 * list verbatim, so the promise the member reads and the expectation the
 * reviewer holds come from one place.
 */
export type RequiredDocument = {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly required: boolean;
};

export const REQUIRED_DOCUMENTS: readonly RequiredDocument[] = [
  {
    id: "photo_id",
    label: "Government-issued photo ID",
    hint: "The document you selected above, clearly photographed in colour.",
    required: true,
  },
  {
    id: "proof_of_address",
    label: "Proof of address",
    hint: "A utility bill, bank statement or lease dated within the last 3 months, showing your name and address.",
    required: true,
  },
  {
    id: "selfie_with_id",
    label: "Selfie holding your ID",
    hint: "Only requested when the reviewer cannot match your photo to the document.",
    required: false,
  },
];

/**
 * Whether this deployment accepts uploaded document files.
 *
 * `false` until the PII decision is made — see the header. Read it through
 * `documentPolicy()` so the member page, the review queue and the API all
 * describe the same reality.
 */
export const DOCUMENTS_UPLOAD_ENABLED = false;

export type DocumentPolicy = {
  readonly uploadEnabled: boolean;
  readonly documents: readonly RequiredDocument[];
};

export function documentPolicy(): DocumentPolicy {
  return { uploadEnabled: DOCUMENTS_UPLOAD_ENABLED, documents: REQUIRED_DOCUMENTS };
}

/** Minimum age, in whole years, at the moment of submission. */
export const MIN_AGE_YEARS = 18;

/**
 * Fold a document number to a comparable form: trim, drop internal whitespace,
 * upper-case.
 *
 * Case and spacing are presentation, not identity. A member who types
 * `a0 1234567` on one attempt and `A01234567` on the next holds the same
 * document, and a duplicate check that disagrees is a false negative. Both the
 * keyed digest and the last-four derive from this, so they cannot be computed
 * from differently-shaped inputs.
 *
 * Pure, and free of `node:crypto`, because `components/dashboard/kyc-form.tsx`
 * is a client component that imports this module.
 */
export function normalizeIdNumber(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

/**
 * Document-number bounds.
 *
 * Deliberately loose. Document formats are country-specific and change without
 * notice; a strict per-country pattern would refuse valid documents from
 * everywhere it was not written for, and a member who cannot submit cannot be
 * verified. These bounds reject the *obviously* wrong - an empty field, a
 * paste of a paragraph, a placeholder like `-----` - and leave the real
 * judgement to the reviewer, who is looking at the member's other details
 * anyway.
 */
export const ID_NUMBER_MIN = 4;
export const ID_NUMBER_MAX = 32;

export function idNumberFormatOk(value: string): boolean {
  const n = normalizeIdNumber(value);
  if (n.length < ID_NUMBER_MIN || n.length > ID_NUMBER_MAX) return false;
  // Letters, digits, hyphens and slashes cover every format we have seen.
  if (!/^[A-Z0-9][A-Z0-9\-/]*$/.test(n)) return false;
  // A single character repeated (`AAAA`, `1111`) is a placeholder, not a number.
  if (/^(.)\1*$/.test(n)) return false;
  return true;
}

/**
 * How long identity *details* are kept, counted from the decision that closed
 * the submission (or from submission, if it was never decided).
 *
 * The verdict outlives the evidence, on purpose: "this member was verified on
 * 4 May 2026" is a fact the platform may need to state for years, while the
 * name, birth date, address and document reference that supported it are not.
 * After this window `scripts/purge-identity-data.ts` clears the details and
 * leaves the status, the dates and the reviewer intact.
 *
 * One year is a starting point, not a compliance opinion - it is the kind of
 * number that should come from counsel. It lives here so that when it does, the
 * change is one line.
 */
export const IDENTITY_RETENTION_DAYS = 365;

/**
 * The columns the retention rule clears. Listed here rather than inline in the
 * purge script so a new identity field cannot be added without appearing in
 * this list being an obvious omission.
 */
export const IDENTITY_FIELDS = [
  "legalName",
  "dateOfBirth",
  "country",
  "address",
  "idType",
  "idNumberHash",
  "idNumberLast4",
] as const;

export type IdentityField = (typeof IDENTITY_FIELDS)[number];

/** The instant before which identity details are due for deletion. */
export function identityPurgeCutoff(now: Date): Date {
  return new Date(now.getTime() - IDENTITY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Field limits. The validator, the form and the reviewer's expectations all
 * read these, so a limit cannot exist in the UI but not at the edge.
 */
export const KYC_LIMITS = {
  legalNameMin: 2,
  legalNameMax: 120,
  countryMin: 2,
  countryMax: 64,
  addressMin: 10,
  addressMax: 400,
  idNumberMin: ID_NUMBER_MIN,
  idNumberMax: ID_NUMBER_MAX,
  reasonMin: 5,
  reasonMax: 400,
} as const;

/**
 * Whole years between two instants, counted in UTC.
 *
 * UTC on purpose: a date of birth arrives as `YYYY-MM-DD` with no zone, and
 * counting the birthday in local time would make the answer depend on where the
 * server happens to sit. Pure, so the boundary cases are unit-tested rather
 * than assumed.
 */
export function ageInYears(dob: Date, asOf: Date): number {
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = asOf.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export function isAdult(dob: Date, asOf: Date): boolean {
  return ageInYears(dob, asOf) >= MIN_AGE_YEARS;
}

/** The oldest birth date we will accept, so a typo cannot produce year 0012. */
export const MAX_AGE_YEARS = 120;
