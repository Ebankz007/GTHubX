/**
 * The `SiteSetting` allowlist and editor shapes.
 *
 * Settings are **fail-closed**: a key that is not listed here cannot be written
 * by the settings API, even by a superadmin. Arbitrary-key writes would let an
 * admin create settings nothing reads, and would make the audit trail
 * meaningless (no schema to diff against).
 *
 * `site.compliance` holds the risk and custody disclosures. Editing them is
 * regulatory-adjacent copy, which is why it sits behind `settings`
 * (SUPER_ADMIN only) and every save writes an audit row with before/after.
 */

export type SettingField = {
  name: string;
  label: string;
  /** Long-form copy gets a textarea rather than a single-line input. */
  multiline?: boolean;
};

export type SettingDefinition = {
  key: string;
  title: string;
  description: string;
  mode: "fields" | "json";
  fields?: SettingField[];
};

export const SETTING_DEFINITIONS: SettingDefinition[] = [
  {
    key: "site.identity",
    title: "Identity",
    description: "The name and domain shown across the site.",
    mode: "fields",
    fields: [
      { name: "name", label: "Site name" },
      { name: "shortName", label: "Short name" },
      { name: "tagline", label: "Tagline" },
      { name: "domain", label: "Domain" },
    ],
  },
  {
    key: "site.contact",
    title: "Contact",
    description: "How members and visitors reach you.",
    mode: "fields",
    fields: [
      { name: "email", label: "Contact email" },
      { name: "supportEmail", label: "Support email" },
      { name: "phone", label: "Phone" },
      { name: "address", label: "Address", multiline: true },
    ],
  },
  {
    key: "site.compliance",
    title: "Compliance copy",
    description:
      "The risk and custody disclosures shown to visitors. Editing these is regulatory-adjacent — every save is recorded in the audit log.",
    mode: "fields",
    fields: [
      { name: "riskNotice", label: "Risk notice", multiline: true },
      { name: "custodyDisclosure", label: "Custody disclosure", multiline: true },
    ],
  },
  {
    key: "site.social",
    title: "Social links",
    description: "Social profiles shown in the footer. Stored as JSON.",
    mode: "json",
  },
];

const BY_KEY = new Map(SETTING_DEFINITIONS.map((d) => [d.key, d]));

export function isAllowedSettingKey(key: string): boolean {
  return BY_KEY.has(key);
}

export function settingDefinition(key: string): SettingDefinition | null {
  return BY_KEY.get(key) ?? null;
}

/** Cap a single setting payload so a superadmin cannot store megabytes. */
export const MAX_SETTING_JSON_CHARS = 20_000;
