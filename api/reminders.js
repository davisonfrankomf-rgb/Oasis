// Envia os lembretes personalizados de cada pessoa por notificação push.
// Chamado a cada 5 minutos pelo agendador do Supabase (pg_cron + pg_net), sem custo extra.
// GET /api/reminders com Authorization: Bearer CRON_SECRET
// Variáveis: CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
import webpush from 'web-push';
import { env, db, json } from './_lib.js';

const URLS = { journal: '/#escrever', gratitude: '/#escrever', breathe: '/#respirar', focus: '/#foco' };
const JANELA = 30; // minutos de tolerância se o agendador atrasar

// Hora, data e dia da semana no fuso horário da pessoa
function agoraLocal(tz) {
  try {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(new Date());
    const g = k => p.find(x => x.type === k)?.value;
    const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { data: `${g('year')}-${g('month')}-${g('day')}`, min: (Number(g('hour')) % 24) * 60 + Number(g('minute')), dia: dias[g('weekday')] };
  } catch { const d = new Date(); return { data: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes(), dia: d.getUTCDay() }; }
}

export async function GET(req) {
  if (req.headers.get('authorization') !== `Bearer ${env('CRON_SECRET')}`) return new Response('não autorizado', { status: 401 });
  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

  const lembretes = await db('reminders?select=id,user_id,purpose,label,message,time,days,last_sent_on&enabled=eq.true');
  if (!lembretes.length) return json({ enviados: 0 });
  const ids = [...new Set(lembretes.map(r => r.user_id))];
  const [perfis, subs] = await Promise.all([
    db(`profiles?select=user_id,timezone&user_id=in.(${ids.join(',')})`),
    db(`push_subscriptions?select=endpoint,user_id,subscription&user_id=in.(${ids.join(',')})`)
  ]);
  const tz = Object.fromEntries(perfis.map(p => [p.user_id, p.timezone]));

  let enviados = 0;
  for (const r of lembretes) {
    const agora = agoraLocal(tz[r.user_id]);
    const alvo = Number(r.time.slice(0, 2)) * 60 + Number(r.time.slice(3, 5));
    const atraso = agora.min - alvo;
    if (!(r.days || []).includes(agora.dia) || atraso < 0 || atraso > JANELA || r.last_sent_on === agora.data) continue;

    // Marca antes de enviar para nunca duplicar
    await db(`reminders?id=eq.${r.id}`, { method: 'PATCH', body: { last_sent_on: agora.data } });
    const msg = JSON.stringify({ title: r.label, body: r.message || '', url: URLS[r.purpose] || '/#hoje', tag: `oasis-${r.id}` });
    for (const s of subs.filter(x => x.user_id === r.user_id)) {
      try { await webpush.sendNotification(s.subscription, msg); enviados++; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await db(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' }); else console.error('push', e.statusCode, e.body); }
    }
  }
  return json({ enviados });
}
