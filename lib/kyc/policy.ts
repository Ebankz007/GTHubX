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
  idNumberMin: 3,
  idNumberMax: 64,
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
