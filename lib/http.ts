/**
 * PATCH JSON and normalise the response. Same never-throws contract as
 * `postJson` — share one error branch between the two.
 */
export async function patchJson<T = unknown>(
  url: string,
  body: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      const message =
        typeof data.error === "string" ? data.error : "Something went wrong.";
      return { ok: false, error: message };
    }

    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "Network error. Please try again." };
  }
}

export type ApiResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * POST JSON and normalise the response. Never throws — network and parse
 * failures collapse into `{ ok: false, error }` so forms have one branch.
 */
export async function postJson<T = unknown>(
  url: string,
  body: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      const message =
        typeof data.error === "string" ? data.error : "Something went wrong.";
      return { ok: false, error: message };
    }

    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "Network error. Please try again." };
  }
}
