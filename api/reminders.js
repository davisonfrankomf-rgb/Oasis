// Lembretes por push no horário escolhido por cada pessoa (manhã e noite, no fuso horário dela).
// Executado de hora a hora pelo Cron da Vercel (cron de hora a hora exige o plano Pro da Vercel).
// Variáveis: CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
import webpush from 'web-push';
import { env, db, json } from './_lib.js';

const horaLocal = (tz) => {
  try {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Europe/Berlin', hour: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const g = k => p.find(x => x.type === k)?.value;
    return { hora: Number(g('hour')) % 24, data: `${g('year')}-${g('month')}-${g('day')}` };
  } catch { return { hora: new Date().getUTCHours(), data: new Date().toISOString().slice(0, 10) }; }
};

export async function GET(req) {
  if (req.headers.get('authorization') !== `Bearer ${env('CRON_SECRET')}`) return new Response('não autorizado', { status: 401 });
  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

  const subs = await db('push_subscriptions?select=endpoint,user_id,subscription');
  if (!subs.length) return json({ enviados: 0 });
  const ids = [...new Set(subs.map(s => s.user_id))];
  const perfis = await db(`profiles?select=user_id,name,timezone,morning_time,evening_time&user_id=in.(${ids.join(',')})`);
  const porId = Object.fromEntries(perfis.map(p => [p.user_id, p]));

  let enviados = 0;
  for (const s of subs) {
    const p = porId[s.user_id]; if (!p) continue;
    const { hora, data } = horaLocal(p.timezone);
    const am = Number((p.morning_time || '08:00').slice(0, 2));
    const pm = Number((p.evening_time || '21:00').slice(0, 2));
    let kind = null;
    if (hora === am) kind = 'morning'; else if (hora === pm) kind = 'evening';
    if (!kind) continue;
    const feitos = await db(`entries?select=id&user_id=eq.${s.user_id}&local_date=eq.${data}&kind=eq.${kind}&limit=1`);
    if (feitos.length) continue;
    const msg = kind === 'morning'
      ? { title: `Good morning${p.name ? ', ' + p.name : ''}`, body: 'Two minutes to check in with yourself before the day starts.', url: '/#manha' }
      : { title: 'Time to close the day', body: 'Three minutes: what went well, what weighed, what you let go.', url: '/#noite' };
    try { await webpush.sendNotification(s.subscription, JSON.stringify(msg)); enviados++; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await db(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' }); }
  }
  console.log('lembretes enviados', enviados);
  return json({ enviados });
}
