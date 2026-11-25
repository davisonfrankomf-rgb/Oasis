// Resumo semanal automático (padrões, gatilhos, vitórias, foco). Executado pelo Cron da Vercel às segundas-feiras.
// Variáveis: CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
// Opcionais: AI_WEEKLY_MODEL (padrão claude-sonnet-5-5), VAPID_* para avisar por push
import webpush from 'web-push';
import { env, db, claude, parseJson, json } from './_lib.js';

const LANGS = { en: 'English', de: 'German', fr: 'French', es: 'Spanish', pt: 'European Portuguese' };

const SYSTEM = `You write the weekly summary inside "Oasis Mind", a 5-minute daily AI journal. You are not a therapist.
From one person's journal entries of the last 7 days, find what genuinely stands out. Be specific (name days and situations they wrote about), warm and concise. Use only what is in the entries; never invent. Never diagnose or mention medication or religion.
Answer ONLY with JSON:
{"headline": "max 6 words, e.g. Calmer than last week.", "patterns": ["max 2 items, each max 18 words"], "triggers": ["max 2 items, each max 18 words"], "wins": ["max 2 items, each max 18 words"], "focus": "one small, concrete focus for next week, max 10 words"}`;

export async function GET(req) {
  if (req.headers.get('authorization') !== `Bearer ${env('CRON_SECRET')}`) return new Response('não autorizado', { status: 401 });

  const hoje = new Date();
  const fim = hoje.toISOString().slice(0, 10);
  const inicio = new Date(hoje.getTime() - 7 * 864e5).toISOString().slice(0, 10);
  const weekStart = inicio;

  const [ativos, perfis] = await Promise.all([
    db('purchases?select=email&status=eq.active'),
    db('profiles?select=user_id,email,name,locale&onboarded_at=not.is.null')
  ]);
  const emails = new Set(ativos.map(a => a.email.toLowerCase()));
  const alvo = perfis.filter(p => p.email && emails.has(p.email.toLowerCase()));

  const vapid = env('VAPID_PRIVATE_KEY');
  if (vapid) webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), vapid);

  let feitos = 0;
  for (const p of alvo) {
    try {
      const entries = await db(`entries?select=kind,local_date,mood,energy,intention,went_well,weighed,gratitude,body&user_id=eq.${p.user_id}&local_date=gte.${inicio}&local_date=lt.${fim}&order=created_at.asc`);
      if (entries.length < 3) continue;
      const texto = entries.map(e => `${e.local_date} ${e.kind} — mood ${e.mood ?? '-'}/5, energy ${e.energy ?? '-'}/5. ${[e.intention && 'Intention: ' + e.intention, e.went_well && 'Went well: ' + e.went_well, e.weighed && 'Weighed: ' + e.weighed, e.gratitude && 'Grateful: ' + e.gratitude, e.body].filter(Boolean).join(' | ').slice(0, 800)}`).join('\n');
      const r = await claude({ model: env('AI_WEEKLY_MODEL', 'claude-sonnet-5-5'), system: SYSTEM, user: `Write in ${LANGS[p.locale] || 'English'}. Name: ${p.name || ''}.\n\nEntries:\n${texto}`, maxTokens: 900 });
      const report = parseJson(r.text);
      if (!report) continue;
      await db('weekly_reports?on_conflict=user_id,week_start', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { user_id: p.user_id, week_start: weekStart, report } });
      feitos++;
      if (vapid) {
        const subs = await db(`push_subscriptions?select=endpoint,subscription&user_id=eq.${p.user_id}`);
        for (const s of subs) {
          try { await webpush.sendNotification(s.subscription, JSON.stringify({ title: 'Your week with Oasis', body: report.headline || 'Your weekly summary is ready.', url: '/#insights' })); }
          catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await db(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' }); }
        }
      }
    } catch (e) { console.error('weekly', p.user_id, e.message); }
  }
  console.log('resumos semanais', feitos);
  return json({ feitos });
}
