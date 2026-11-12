export class ApiClientError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
      credentials: "same-origin",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiClientError(0, "NETWORK", "Network error. Check your connection and try again.");
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/s/")) {
      // Intentional hard redirect: the session expired and this runs outside any React component.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
    throw new ApiClientError(res.status, err?.code ?? "ERROR", err?.message ?? `Request failed (${res.status}).`);
  }
  return data as T;
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : "Something went wrong.");
