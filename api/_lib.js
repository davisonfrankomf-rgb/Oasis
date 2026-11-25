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

// Chamada à API da Anthropic (Claude). Devolve { text, usage }
export async function claude({ model, system, user, maxTokens = 700 }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }]
    })
  });
  if (!r.ok) throw new Error(`anthropic ${r.status} ${await r.text()}`);
  const out = await r.json();
  const text = (out.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  return { text, usage: out.usage || {} };
}

// Extrai o primeiro objeto JSON de um texto
export function parseJson(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

// Palavras que indicam risco: bloqueiam o coaching e mostram linhas de apoio, mesmo antes da IA
export const RISK_RE = /\b(kill myself|end my life|suicid\w*|want to die|wanna die|self[- ]?harm|hurt myself|cut myself|no reason to live|better off dead|overdos\w*|umbringen|selbstmord|suizid|me suicider|suicidarme|matarme|matar-me|suicidar)\b/i;

export const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
