export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      // corpo não-JSON — mantém mensagem padrão
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

/** Chamadas do hóspede — autenticadas por magic token (?token=). */
export async function guestApi<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${API_URL}${path}${sep}token=${encodeURIComponent(token)}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  return parseOrThrow<T>(res);
}

// --- Admin (x-admin-key guardada em sessionStorage no MVP) ---

const ADMIN_KEY_STORAGE = "concierge_admin_key";

export function getAdminKey(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ADMIN_KEY_STORAGE);
}

export function setAdminKey(key: string): void {
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
}

export function clearAdminKey(): void {
  sessionStorage.removeItem(ADMIN_KEY_STORAGE);
}

export async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  const key = getAdminKey();
  const res = await fetch(`${API_URL}/api/admin${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-admin-key": key ?? "",
      ...init?.headers,
    },
  });
  return parseOrThrow<T>(res);
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
