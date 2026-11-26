// Funções partilhadas pelas rotas /api (o "_" no nome impede a Vercel de expor este ficheiro como rota).

export const env = (k, d = '') => process.env[k] || d;

const svcHeaders = () => ({
  apikey: env('SUPABASE_SERVICE_ROLE_KEY'),
  Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,
  'Content-Type': 'application/json'
});

// Chamada REST ao Supabase com a service role (ignora RLS: usar só no servidor)
export async function db(path, { method = 'GET', body, prefer } = {}) {
  const headers = svcHeaders();
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`supabase ${r.status} ${await r.text()}`);
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

// Valida o token de sessão enviado pelo app e devolve { id, email }
export async function userFromRequest(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const r = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, {
    headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? { id: u.id, email: (u.email || '').toLowerCase() } : null;
}

export async function hasAccess(email) {
  const rows = await db(`purchases?select=status&status=eq.active&email=eq.${encodeURIComponent(email)}`);
  return rows.length > 0;
}

export const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
