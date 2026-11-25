// Webhook de vendas (Cakto, Stripe via Zapier/Make, ou outra plataforma) -> libera ou revoga o acesso no Supabase.
// URL para cadastrar: https://oasismind.app/api/webhook?token=SEU_WEBHOOK_SECRET
//
// Variáveis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WEBHOOK_SECRET, SITE_URL (padrão https://oasismind.app)
//   PRODUCT_MAP -> JSON ligando o ID (ou o nome exato) de cada produto/oferta ao plano, ex.:
//   {"ID_PLANO_MENSAL":"monthly","ID_PLANO_ANUAL":"annual","ID_OFERTA_BLACK_FRIDAY":"annual"}
import { env, db, json } from './_lib.js';

const APROVADO = ['paid', 'approved', 'purchase_approved', 'order_approved', 'compra_aprovada', 'subscription_renewed',
  'subscription_active', 'active', 'completed', 'aprovado', 'pago', 'invoice.paid', 'checkout.session.completed'];
const REVOGADO = ['refunded', 'refund', 'chargedback', 'chargeback', 'subscription_canceled', 'subscription_cancelled',
  'canceled', 'cancelled', 'subscription_late', 'overdue', 'expired', 'reembolsado', 'cancelado', 'estornado',
  'customer.subscription.deleted', 'charge.refunded'];

// Percorre o JSON e devolve todos os pares [chave, valor, caminho]
function* percorrer(o, caminho = '') {
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) {
      const c = caminho ? `${caminho}.${k}` : k;
      if (v && typeof v === 'object') yield* percorrer(v, c);
      else yield [k.toLowerCase(), v, c.toLowerCase()];
    }
  }
}

function extrair(corpo) {
  let email = null; const ids = new Set(); const status = [];
  for (const [k, v, c] of percorrer(corpo)) {
    if (v == null || v === '') continue;
    const s = String(v).trim();
    if (!email && k.includes('email') && /customer|buyer|cliente|comprador/.test(c) && /@/.test(s)) email = s.toLowerCase();
    if (/product|produto|offer|oferta|plan|price/.test(c) && /(^|_)(id|code|name|nome|title)$|^product_id$/.test(k)) ids.add(s);
    if (/status|event|evento|webhook_event_type|type/.test(k)) status.push(s.toLowerCase());
  }
  if (!email) for (const [k, v] of percorrer(corpo)) if (k.includes('email') && /@/.test(String(v))) { email = String(v).toLowerCase(); break; }
  const pedido = corpo.order_id || corpo.id || corpo?.data?.id || null;
  return { email, ids: [...ids], status, pedido: pedido ? String(pedido) : null };
}

export function GET() { return new Response('ok'); }

export async function POST(req) {
  const url = new URL(req.url);
  if (url.searchParams.get('token') !== env('WEBHOOK_SECRET')) return new Response('token inválido', { status: 401 });

  let corpo;
  try { corpo = await req.json(); } catch { return new Response('JSON inválido', { status: 400 }); }

  const mapa = JSON.parse(env('PRODUCT_MAP', '{}'));
  const { email, ids, status, pedido } = extrair(corpo);
  const planos = [...new Set(ids.map(i => mapa[i]).filter(Boolean))];
  const novo = status.some(s => REVOGADO.includes(s)) ? 'revoked' : status.some(s => APROVADO.includes(s)) ? 'active' : null;

  console.log('webhook', JSON.stringify({ email, ids, planos, status, novo }));
  if (!email || !planos.length || !novo) return new Response('ignorado', { status: 200 });

  // Acessos de administrador (provider = admin) nunca são alterados pelo webhook
  const adm = await db(`purchases?select=product&provider=eq.admin&email=eq.${encodeURIComponent(email)}`).catch(() => []);
  if (adm.length) return json({ ok: true, email, ignorado: 'acesso de administrador' });

  try {
    await db('purchases?on_conflict=email,product', {
      method: 'POST', prefer: 'resolution=merge-duplicates',
      body: [{ email, product: 'oasis', plan: planos[0], status: novo, order_id: pedido, provider: url.searchParams.get('origem') || 'checkout', updated_at: new Date().toISOString() }]
    });
  } catch (e) { console.error(e.message); return new Response('erro ao salvar', { status: 500 }); }

  // Compra aprovada: envia na hora o e-mail de acesso (código de 6 dígitos)
  let emailAcesso = null;
  if (novo === 'active') {
    const site = env('SITE_URL', 'https://oasismind.app');
    const e = await fetch(`${env('SUPABASE_URL')}/auth/v1/otp?redirect_to=${encodeURIComponent(site + '/')}`, {
      method: 'POST',
      headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, create_user: true })
    });
    emailAcesso = e.ok ? 'enviado' : `falhou ${e.status}`;
    if (!e.ok) console.error('email de acesso', e.status, await e.text());
  }
  return json({ ok: true, email, plano: planos[0], status: novo, emailAcesso });
}
