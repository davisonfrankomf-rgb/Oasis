// Resposta da IA a cada entrada (check-in, nota, SOS) e às respostas seguintes da pessoa.
// POST /api/ai  { entry_id, mode: 'entry' | 'followup', message?, lang? }  com Authorization: Bearer <token da sessão>
// Variáveis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
// Opcionais: AI_MODEL (padrão claude-haiku-5-5), AI_DAILY_LIMIT (padrão 40 respostas por pessoa por dia)
import { env, db, userFromRequest, hasAccess, claude, parseJson, RISK_RE, json } from './_lib.js';

const LANGS = { en: 'English', de: 'German', fr: 'French', es: 'Spanish', pt: 'European Portuguese' };

const SYSTEM = `You are Oasis, the reflective companion inside "Oasis Mind", a 5-minute daily AI journal for adults in Europe.
Your job: help the person understand what they feel, notice patterns and find one next step. You are NOT a therapist, doctor or crisis service.

Style rules:
- Warm, calm, plain language. Never preachy, never a lecture, no clichés, no emojis, no exclamation marks.
- "reply": at most 80 words. Usually one short reflection of what they wrote (name the feeling you hear) and ONE open question. Occasionally a tiny concrete suggestion instead of a question.
- Use what you remember about them naturally when it is relevant ("On Monday you mentioned…"). Never invent facts you were not given.
- Ground suggestions in well-established psychology and neuroscience only: affect labeling, expressive writing, cognitive reframing (CBT: "what is the evidence for this thought?"), self-compassion, implementation intentions ("when X, I will Y"), gratitude, behavioural activation, slow breathing. Never mention religion, spirituality, astrology or pseudoscience.
- Never diagnose, never name disorders, never talk about medication or dosages, never promise outcomes.
- Address the person by name only sometimes.

Safety (assess every message):
- "high": any mention of suicidal thoughts, wanting to die, self-harm, a plan or means to hurt themselves or someone else, or being in danger right now (e.g. violence at home).
- "medium": hopelessness, feeling unable to cope, severe distress, but no intent or danger.
- "none": everything else.
If "high": the reply is 2–3 short caring sentences, takes them seriously, says they deserve support from a person right now and that support lines are shown on screen. No coaching, no questions about details.
If "medium": reply normally but gently mention that talking to someone they trust or a professional can help.

Memory:
- "memory_summary": an updated, compact profile of this person (max 120 words): recurring themes, people, goals, triggers, what helps. Merge with the previous summary; drop outdated details. No sensitive details beyond what is needed to support them.
- "open_threads": up to 3 things worth following up in a later check-in, each { "topic": short label, "question": a warm follow-up question that names the day or situation, max 25 words }. Remove threads that were answered.
- "evening_question": for morning entries, one reflection question for tonight that connects to what they wrote this morning (max 20 words). Otherwise "".

Answer ONLY with a JSON object, no other text:
{"reply": "...", "risk": "none|medium|high", "evening_question": "...", "memory_summary": "...", "open_threads": [{"topic": "...", "question": "..."}]}`;

const SAFE_REPLY = {
  en: 'Thank you for telling me. What you wrote matters, and you deserve support from a real person right now. Please reach out to one of the free support lines on your screen — they are there to listen.',
};

function describeEntry(e) {
  const parts = [`Type: ${e.kind} check-in on ${e.local_date}`];
  if (e.mood) parts.push(`Mood: ${e.mood}/5`);
  if (e.energy) parts.push(`Energy: ${e.energy}/5`);
  if (e.prompt) parts.push(`Question shown: ${e.prompt}`);
  if (e.intention) parts.push(`Intention for today: ${e.intention}`);
  if (e.went_well) parts.push(`What went well: ${e.went_well}`);
  if (e.weighed) parts.push(`What weighed: ${e.weighed}`);
  if (e.gratitude) parts.push(`Grateful for: ${e.gratitude}`);
  if (e.body) parts.push(`Free writing: ${e.body}`);
  return parts.join('\n');
}

export async function POST(req) {
  try {
    const user = await userFromRequest(req);
    if (!user) return json({ error: 'unauthorized' }, 401);
    if (!(await hasAccess(user.email))) return json({ error: 'no_access' }, 403);

    const { entry_id, mode = 'entry', message = '', lang } = await req.json().catch(() => ({}));
    if (!entry_id) return json({ error: 'entry_id required' }, 400);

    // Limite diário de respostas da IA
    const day = new Date().toISOString().slice(0, 10);
    const limit = Number(env('AI_DAILY_LIMIT', '40'));
    const [usage] = await db(`ai_usage?select=calls,input_tokens,output_tokens&user_id=eq.${user.id}&day=eq.${day}`);
    if ((usage?.calls || 0) >= limit) return json({ error: 'daily_limit' }, 429);

    const [entry] = await db(`entries?select=*&id=eq.${encodeURIComponent(entry_id)}&user_id=eq.${user.id}`);
    if (!entry) return json({ error: 'not_found' }, 404);

    const [[profile], [memory], recent] = await Promise.all([
      db(`profiles?select=name,goal,locale,country&user_id=eq.${user.id}`),
      db(`memory?select=summary,open_threads&user_id=eq.${user.id}`),
      db(`entries?select=kind,local_date,mood,energy,intention,went_well,weighed,body,ai_reply&user_id=eq.${user.id}&id=neq.${entry.id}&order=created_at.desc&limit=4`)
    ]);
    const language = LANGS[lang] || LANGS[profile?.locale] || 'English';
    const followups = Array.isArray(entry.followups) ? entry.followups : [];
    const userMsg = String(message).slice(0, 2000);
    const allText = [entry.body, entry.intention, entry.weighed, entry.went_well, userMsg].join(' ');

    let out;
    let tokens = { input_tokens: 0, output_tokens: 0 };

    if (RISK_RE.test(allText)) {
      // Bloqueio imediato: não fazemos coaching, mostramos ajuda humana
      out = { reply: SAFE_REPLY.en, risk: 'high', evening_question: '', memory_summary: memory?.summary || '', open_threads: memory?.open_threads || [] };
    } else {
      const context = [
        `Respond in ${language}.`,
        `Person: ${profile?.name || 'unknown'}. Main goal: ${profile?.goal || 'not set'}.`,
        `What you remember (summary): ${memory?.summary || 'nothing yet — this may be their first entry.'}`,
        `Open threads: ${JSON.stringify(memory?.open_threads || [])}`,
        `Recent entries (newest first):\n${(recent || []).map(r => `- ${r.local_date} ${r.kind}: mood ${r.mood ?? '-'}, energy ${r.energy ?? '-'}; ${[r.intention, r.went_well, r.weighed, r.body].filter(Boolean).join(' | ').slice(0, 400)}`).join('\n') || '- none'}`,
        `\nCURRENT ENTRY:\n${describeEntry(entry)}`
      ];
      if (mode === 'followup') {
        context.push(`\nYour first reply was: ${entry.ai_reply || ''}`);
        for (const f of followups) context.push(`${f.role === 'user' ? 'Person' : 'You'}: ${f.text}`);
        context.push(`Person now writes: ${userMsg}\n\nReply to this latest message. Keep "evening_question" as "".`);
      }
      const r = await claude({ model: env('AI_MODEL', 'claude-haiku-5-5'), system: SYSTEM, user: context.join('\n'), maxTokens: 700 });
      tokens = { input_tokens: r.usage.input_tokens || 0, output_tokens: r.usage.output_tokens || 0 };
      out = parseJson(r.text) || { reply: r.text.trim(), risk: 'none' };
    }

    const risk = ['none', 'medium', 'high'].includes(out.risk) ? out.risk : 'none';
    const reply = String(out.reply || '').trim().slice(0, 1200);

    // Atualiza a entrada
    const patch = { risk };
    if (mode === 'followup') patch.followups = [...followups, { role: 'user', text: userMsg }, { role: 'ai', text: reply }];
    else { patch.ai_reply = reply; if (entry.kind === 'morning') patch.evening_question = String(out.evening_question || '').slice(0, 300); }
    const [updated] = await db(`entries?id=eq.${entry.id}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });

    // Memória, risco e uso (não bloqueiam a resposta se falharem)
    const tasks = [];
    if (risk !== 'high' && (out.memory_summary || out.open_threads)) {
      tasks.push(db('memory?on_conflict=user_id', {
        method: 'POST', prefer: 'resolution=merge-duplicates',
        body: { user_id: user.id, summary: String(out.memory_summary || memory?.summary || '').slice(0, 1500), open_threads: (Array.isArray(out.open_threads) ? out.open_threads : []).slice(0, 3).map(t => ({ topic: String(t.topic || '').slice(0, 60), question: String(t.question || '').slice(0, 200), date: entry.local_date })), updated_at: new Date().toISOString() }
      }));
    }
    if (risk !== 'none') tasks.push(db('risk_events', { method: 'POST', body: { user_id: user.id, entry_id: entry.id, level: risk } }));
    tasks.push(db('ai_usage?on_conflict=user_id,day', {
      method: 'POST', prefer: 'resolution=merge-duplicates',
      body: { user_id: user.id, day, calls: (usage?.calls || 0) + 1, input_tokens: (usage?.input_tokens || 0) + tokens.input_tokens, output_tokens: (usage?.output_tokens || 0) + tokens.output_tokens }
    }));
    const results = await Promise.allSettled(tasks);
    results.filter(x => x.status === 'rejected').forEach(x => console.error('ai side task', x.reason?.message));

    return json({ risk, entry: { ai_reply: updated.ai_reply, followups: updated.followups, evening_question: updated.evening_question } });
  } catch (e) {
    console.error('ai error', e.message);
    return json({ error: 'server_error' }, 500);
  }
}

export function GET() { return new Response('ok'); }
