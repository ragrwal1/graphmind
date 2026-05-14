const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServerKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function hasSupabaseAdminConfig() {
  return Boolean(supabaseUrl && supabaseServerKey);
}

export function getSupabaseRestConfig() {
  if (!supabaseUrl || !supabaseServerKey) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL plus a server-side Supabase key."
    );
  }

  return {
    url: supabaseUrl,
    key: supabaseServerKey
  };
}

export async function supabaseRestFetch(path: string, init: RequestInit = {}) {
  const config = getSupabaseRestConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", config.key);
  headers.set("Authorization", `Bearer ${config.key}`);
  headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");

  return fetch(`${config.url}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });
}
