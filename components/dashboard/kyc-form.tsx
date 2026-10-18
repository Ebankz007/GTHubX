"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/http";
import { TextField, TextArea, FormError, FormNotice } from "@/components/auth/form-field";
import { ID_TYPES } from "@/lib/kyc/policy";

export type KycFormValues = {
  legalName: string;
  dateOfBirth: string;
  country: string;
  address: string;
  idType: string;
  idNumber: string;
};

const selectClass =
  "h-11 w-full rounded-xl border border-border bg-elevated px-3.5 text-sm text-foreground transition-colors focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-50";

/**
 * The member's KYC submission.
 *
 * Prefilled on resubmission so a member fixing one rejected field does not
 * retype the rest — the rejection email sent them here, and making them start
 * over would be the difference between "correctable" and "give up".
 */
export function KycForm({ initial }: { initial: KycFormValues }) {
  const router = useRouter();
  const [values, setValues] = React.useState<KycFormValues>(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function set<K extends keyof KycFormValues>(key: K, value: KycFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setError(null);
    setNotice(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    const result = await postJson<{ ok: boolean; status: string }>(
      "/api/account/kyc",
      values,
    );

    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setNotice("Submitted. Your details are now with the review team.");
    // Re-read the server component so the page switches to "in review".
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <TextField
        label="Full legal name"
        name="legalName"
        value={values.legalName}
        onChange={(e) => set("legalName", e.target.value)}
        autoComplete="name"
        hint="Exactly as it appears on the document you are presenting."
        required
      />
      <TextField
        label="Date of birth"
        name="dateOfBirth"
        type="date"
        value={values.dateOfBirth}
        onChange={(e) => set("dateOfBirth", e.target.value)}
        required
      />
      <TextField
        label="Country of residence"
        name="country"
        value={values.country}
        onChange={(e) => set("country", e.target.value)}
        autoComplete="country-name"
        placeholder="e.g. Nigeria"
        required
      />
      <TextArea
        label="Residential address"
        name="address"
        rows={3}
        value={values.address}
        onChange={(e) => set("address", e.target.value)}
        autoComplete="street-address"
        hint="The address on your proof of address, including city and postal code."
        required
      />

      <label htmlFor="idType" className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          Document you are presenting
        </span>
        <select
          id="idType"
          name="idType"
          value={values.idType}
          onChange={(e) => set("idType", e.target.value)}
          className={selectClass}
          required
        >
          {ID_TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-faint">
          {ID_TYPES.find((t) => t.id === values.idType)?.hint ?? ""}
        </span>
      </label>

      <TextField
        label="Document number"
        name="idNumber"
        value={values.idNumber}
        onChange={(e) => set("idNumber", e.target.value)}
        hint="The number printed on the document, without spaces."
        required
      />

      <FormError message={error} />
      <FormNotice message={notice} />

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Submitting…" : "Submit for review"}
      </button>
    </form>
  );
}
