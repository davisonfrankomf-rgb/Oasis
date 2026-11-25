// Apaga a conta e todos os dados da pessoa (direito ao apagamento, RGPD art. 17).
// POST /api/delete-account com Authorization: Bearer <token da sessão>
// Perfil, entradas, memória, resumos, uso e notificações são apagados em cascata com o utilizador.
// O registo de compra (purchases) fica, porque é necessário para faturação e obrigações fiscais.
import { env, userFromRequest, json } from './_lib.js';

export async function POST(req) {
  const user = await userFromRequest(req);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const r = await fetch(`${env('SUPABASE_URL')}/auth/v1/admin/users/${user.id}`, {
    method: 'DELETE',
    headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}` }
  });
  if (!r.ok) { console.error('delete user', r.status, await r.text()); return json({ error: 'failed' }, 500); }
  console.log('conta apagada', user.id);
  return json({ ok: true });
}
