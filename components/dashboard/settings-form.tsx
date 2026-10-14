"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { patchJson } from "@/lib/http";
import { TextField, FormError, FormNotice } from "@/components/auth/form-field";

type Values = {
  fullName: string;
  phone: string;
  country: string;
};

export function SettingsForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const [values, setValues] = React.useState<Values>(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setError(null);
    setNotice(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    const result = await patchJson<{ ok: boolean; message: string }>(
      "/api/account/profile",
      values,
    );

    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setNotice(result.data.message);
    // Re-read the server component so the sidebar/header show the new name.
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <TextField
        label="Full name"
        name="fullName"
        value={values.fullName}
        onChange={(e) => set("fullName", e.target.value)}
        autoComplete="name"
        required
      />
      <TextField
        label="Phone"
        name="phone"
        type="tel"
        value={values.phone}
        onChange={(e) => set("phone", e.target.value)}
        autoComplete="tel"
        placeholder="+1 555 000 0000"
      />
      <TextField
        label="Country"
        name="country"
        value={values.country}
        onChange={(e) => set("country", e.target.value)}
        autoComplete="country-name"
        placeholder="e.g. Nigeria"
      />

      <FormError message={error} />
      <FormNotice message={notice} />

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
