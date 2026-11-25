// Oasis Mind — app (PWA, sem build). Rotas por hash: #hoje #manha #noite #nota #resposta-ID #diario #insights #sos #ajustes
{
const CFG = window.APP_CONFIG || {};
const DATA = window.OASIS_DATA;
const DEMO = !CFG.supabaseUrl;
const $ = s => document.querySelector(s);
const view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ico = (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

/* ---------- Idioma ---------- */
let LANG = CFG.idiomaPadrao || 'en';
function t(k, vars = {}) {
  const dict = (window.I18N[LANG] && window.I18N[LANG][k]) ?? window.I18N.en[k] ?? k;
  return dict.replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');
}
const SPEECH_LANG = { en: 'en-GB', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', pt: 'pt-PT' };

/* ---------- Armazenamento local ---------- */
const mem = {};
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : (k in mem ? mem[k] : d); } catch (e) { return k in mem ? mem[k] : d; } },
  set(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) {} }
};

/* ---------- Datas ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = () => iso(new Date());
const somaDias = (s, n) => { const [y, m, d] = s.split('-').map(Number); return iso(new Date(y, m - 1, d + n)); };
const dataLonga = () => new Date().toLocaleDateString(LANG, { weekday: 'long', day: 'numeric', month: 'long' });
const dataCurta = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(LANG, { weekday: 'short', day: 'numeric', month: 'short' }); };
const hora = () => new Date().getHours();

/* ---------- Estado ---------- */
const S = { user: null, sb: null, access: false, profile: null, entries: [], memory: null, weekly: null, loaded: false };

/* ---------- Supabase ---------- */
function carregarScript(src) {
  return new Promise((ok, falha) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = falha; document.head.appendChild(s); });
}
async function iniciarSupabase() {
  if (DEMO) { S.user = LS.get('oasis_demo_user', null); return; }
  await carregarScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js');
  S.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  const { data } = await S.sb.auth.getSession();
  if (/access_token|error_description/.test(location.hash)) history.replaceState(null, '', location.pathname + '#hoje');
  S.user = data.session ? { id: data.session.user.id, email: data.session.user.email } : null;
}
async function token() { const { data } = await S.sb.auth.getSession(); return data.session?.access_token; }

const Auth = {
  async enviar(email) {
    if (DEMO) return;
    const { error } = await S.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + '/' } });
    if (error) throw error;
  },
  async verificar(email, code) {
    if (DEMO) {
      if (code !== '123456') throw new Error(t('err.code'));
      S.user = { id: 'demo', email }; LS.set('oasis_demo_user', S.user); return;
    }
    const { data, error } = await S.sb.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) throw new Error(t('err.code'));
    S.user = { id: data.user.id, email: data.user.email };
  },
  async entrarSenha(email, senha) {
    if (DEMO) { S.user = { id: 'demo', email }; LS.set('oasis_demo_user', S.user); return; }
    const { data, error } = await S.sb.auth.signInWithPassword({ email, password: senha });
    if (error) throw new Error(t('err.password'));
    S.user = { id: data.user.id, email: data.user.email };
  },
  async definirSenha(senha) {
    if (DEMO) return;
    const { error } = await S.sb.auth.updateUser({ password: senha });
    if (error) throw new Error(/different/i.test(error.message) ? t('pw.same') : t('pw.fail'));
  },
  async sair() {
    if (!DEMO) await S.sb.auth.signOut();
    S.user = null; S.profile = null; S.entries = []; S.memory = null; S.weekly = null; S.loaded = false;
    LS.del('oasis_demo_user');
  }
};

/* ---------- Dados ---------- */
const Db = {
  async carregar() {
    if (DEMO) {
      S.access = true;
      S.profile = LS.get('oasis_profile', null);
      S.entries = LS.get('oasis_entries', []);
      S.memory = LS.get('oasis_memory', null);
      S.weekly = null;
      S.loaded = true; return;
    }
    const uid = S.user.id;
    const desde = somaDias(hoje(), -60);
    const [compras, perfil, entradas, memoria, semanal] = await Promise.all([
      S.sb.from('purchases').select('product,status').eq('status', 'active'),
      S.sb.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
      S.sb.from('entries').select('*').gte('local_date', desde).order('created_at', { ascending: false }).limit(200),
      S.sb.from('memory').select('summary,open_threads,updated_at').eq('user_id', uid).maybeSingle(),
      S.sb.from('weekly_reports').select('*').order('week_start', { ascending: false }).limit(1)
    ]);
    S.access = (compras.data || []).length > 0;
    S.profile = perfil.data || null;
    S.entries = entradas.data || [];
    S.memory = memoria.data || null;
    S.weekly = (semanal.data || [])[0] || null;
    if (S.profile?.locale && window.I18N[S.profile.locale] && (CFG.idiomasAtivos || ['en']).includes(S.profile.locale)) LANG = S.profile.locale;
    S.loaded = true;
  },
  async salvarPerfil(p) {
    const row = { ...(S.profile || {}), ...p, user_id: S.user.id, email: S.user.email, updated_at: new Date().toISOString() };
    if (DEMO) { S.profile = row; LS.set('oasis_profile', row); return; }
    const { data, error } = await S.sb.from('profiles').upsert(row).select().single();
    if (error) throw error;
    S.profile = data;
  },
  async criarEntrada(e) {
    const row = { ...e, local_date: hoje(), followups: [] };
    if (DEMO) {
      row.id = 'd' + Date.now(); row.created_at = new Date().toISOString();
      S.entries.unshift(row); LS.set('oasis_entries', S.entries); return row;
    }
    const { data, error } = await S.sb.from('entries').insert({ ...row, user_id: S.user.id }).select().single();
    if (error) throw error;
    S.entries.unshift(data); return data;
  },
  async recarregarMemoria() {
    if (DEMO) return;
    const { data } = await S.sb.from('memory').select('summary,open_threads,updated_at').eq('user_id', S.user.id).maybeSingle();
    S.memory = data || null;
  },
  async exportar() {
    if (DEMO) return { profile: S.profile, entries: S.entries, memory: S.memory };
    const [p, e, m, w] = await Promise.all([
      S.sb.from('profiles').select('*').eq('user_id', S.user.id).maybeSingle(),
      S.sb.from('entries').select('*').order('created_at'),
      S.sb.from('memory').select('*').eq('user_id', S.user.id).maybeSingle(),
      S.sb.from('weekly_reports').select('*').order('week_start')
    ]);
    return { exported_at: new Date().toISOString(), email: S.user.email, profile: p.data, entries: e.data, memory: m.data, weekly_reports: w.data };
  },
  async apagarConta() {
    if (DEMO) { ['oasis_profile', 'oasis_entries', 'oasis_memory'].forEach(LS.del); return; }
    const r = await fetch('/api/delete-account', { method: 'POST', headers: { Authorization: `Bearer ${await token()}` } });
    if (!r.ok) throw new Error(t('err.generic'));
  }
};
const entrada = id => S.entries.find(e => String(e.id) === String(id));
const entradaHoje = kind => S.entries.find(e => e.local_date === hoje() && e.kind === kind);

/* ---------- IA ---------- */
const RISCO = /\b(kill myself|end my life|suicid|want to die|self[- ]?harm|hurt myself|cut myself|no reason to live|better off dead|overdose)\b/i;
async function pedirIA(e, mode = 'entry', message = '') {
  if (DEMO) return iaDemo(e, mode, message);
  if (!navigator.onLine) throw Object.assign(new Error(t('err.offline')), { offline: true });
  const r = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ entry_id: e.id, mode, message, lang: LANG })
  });
  if (r.status === 429) throw new Error(t('err.limit'));
  if (!r.ok) throw new Error(t('err.generic'));
  const out = await r.json();
  Object.assign(e, { ai_reply: out.entry.ai_reply, followups: out.entry.followups, evening_question: out.entry.evening_question, risk: out.risk });
  Db.recarregarMemoria().catch(() => {});
  return out;
}
async function iaDemo(e, mode, message) {
  await new Promise(r => setTimeout(r, 900));
  const texto = [e.body, e.intention, e.weighed, message].join(' ');
  const risk = RISCO.test(texto) ? 'high' : 'none';
  const nome = S.profile?.name || 'there';
  let reply;
  if (mode === 'followup') reply = `Thank you for staying with this, ${nome}. Noticing it is already a step.\n\nWhat would be one small, kind thing you could do for yourself in the next hour?`;
  else if (e.kind === 'evening') reply = `Thank you for closing the day with this. You named what went well and what weighed — both matter.\n\nWhat would you like to leave here tonight, so it doesn't follow you to bed?`;
  else if ((e.mood || 3) <= 2) reply = `It sounds like you're arriving with a heavy load today. Writing it down is a way of putting some of it outside your head.\n\nWhat is the one part of it you can actually influence today?`;
  else reply = `There's a lot going on — and you still took a moment to check in. That counts.\n\nIf today went well, what would be different by tonight?`;
  if (mode === 'followup') e.followups = [...(e.followups || []), { role: 'user', text: message }, { role: 'ai', text: reply }];
  else { e.ai_reply = reply; e.evening_question = 'Earlier you wrote about your morning. How did it actually go?'; }
  e.risk = risk;
  if (mode === 'entry' && e.kind !== 'evening' && (e.body || '').length > 10) {
    S.memory = { summary: '', open_threads: [{ topic: 'morning', question: `On ${dataCurta(e.local_date)} you wrote: "${e.body.slice(0, 70)}${e.body.length > 70 ? '…' : ''}" How is that now?`, date: e.local_date }] };
    LS.set('oasis_memory', S.memory);
  }
  LS.set('oasis_entries', S.entries);
  return { risk, entry: e };
}

/* ---------- Utilidades de interface ---------- */
let tAviso;
function aviso(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(tAviso); tAviso = setTimeout(() => el.classList.remove('on'), 3400); }
function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.hidden = false; m.onclick = ev => { if (ev.target === m) fecharModal(); }; }
function fecharModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
const go = h => { if (location.hash === h) render(); else location.hash = h; };
const pais = () => DATA.countries[S.profile?.country] || DATA.countries.OTHER;
const MOOD_COR = { 1: '#BDA4F2', 2: '#D9C9F7', 3: '#E2D9CC', 4: '#9FDCD2', 5: '#4FB3A5' };
const hashN = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

function ligarMic(btn, campo) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { btn.remove(); return; }
  let rec = null; const ph = campo.placeholder;
  btn.onclick = () => {
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = SPEECH_LANG[LANG] || 'en-GB'; rec.continuous = true; rec.interimResults = false;
    const base = campo.value;
    let dito = '';
    rec.onresult = ev => { for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) dito += ev.results[i][0].transcript + ' '; campo.value = (base ? base.trim() + ' ' : '') + dito.trim(); };
    rec.onend = () => { rec = null; btn.setAttribute('aria-pressed', 'false'); btn.querySelector('span').textContent = t('mic.speak'); campo.placeholder = ph; };
    rec.onerror = () => rec && rec.stop();
    rec.start();
    btn.setAttribute('aria-pressed', 'true'); btn.querySelector('span').textContent = t('mic.stop'); campo.placeholder = t('entry.listening');
  };
}
const micBtn = id => `<button type="button" class="mic" id="${id}" aria-pressed="false" aria-label="${esc(t('mic.label'))}">${ico('i-mic')}<span>${esc(t('mic.speak'))}</span></button>`;

/* ---------- Login (mesmo padrão do Inabaláveis: link/código por e-mail ou senha) ---------- */
function telaLogin() {
  view.innerHTML = `<section class="login">
    <div class="login-hero">
      <img src="assets/logo.png" alt="Oasis Mind">
      <p>${esc(t('app.tagline'))}</p>
    </div>
    <form class="card form" id="fEmail" novalidate>
      <div class="field"><label class="label" for="email">${esc(t('login.emailLabel'))}</label>
        <input class="input" id="email" type="email" inputmode="email" autocomplete="email" required placeholder="${esc(t('login.emailPh'))}"></div>
      <div class="field" id="wrapSenha" hidden><label class="label" for="senha">${esc(t('login.password'))}</label>
        <input class="input" id="senha" type="password" autocomplete="current-password"></div>
      <div class="field" id="wrapCod" hidden><label class="label" for="codigo">${esc(t('login.codeLabel'))}</label>
        <input class="input code-input" id="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="8" pattern="[0-9]*"></div>
      <div class="err" id="erro" role="alert"></div>
      <button class="btn" id="bEntrar" type="submit">${esc(t('login.sendAccess'))}</button>
      <button class="btn sec" id="bModo" type="button">${esc(t('login.withPassword'))}</button>
    </form>
    <p class="ajuda" id="ajuda">${esc(DEMO ? t('login.demo') : t('login.help2'))}</p>
  </section>`;
  let etapa = 1, modoSenha = false;
  $('#bModo').onclick = () => {
    modoSenha = !modoSenha; etapa = 1; $('#erro').textContent = '';
    $('#wrapSenha').hidden = !modoSenha; $('#wrapCod').hidden = true; $('#email').readOnly = false;
    $('#bEntrar').textContent = modoSenha ? t('login.signin') : t('login.sendAccess');
    $('#bModo').textContent = modoSenha ? t('login.withoutPassword') : t('login.withPassword');
    if (modoSenha) $('#senha').focus();
  };
  $('#fEmail').addEventListener('submit', async ev => {
    ev.preventDefault();
    const email = $('#email').value.trim().toLowerCase(), erro = $('#erro'), b = $('#bEntrar');
    erro.textContent = '';
    if (!/^\S+@\S+\.\S+$/.test(email)) { erro.textContent = t('err.email'); return; }
    b.disabled = true;
    try {
      if (modoSenha) {
        await Auth.entrarSenha(email, $('#senha').value);
        S.loaded = false; return render();
      } else if (etapa === 1) {
        await Auth.enviar(email);
        etapa = 2; $('#wrapCod').hidden = false; $('#email').readOnly = true; b.textContent = t('login.enterCode');
        $('#ajuda').textContent = DEMO ? t('login.demo') : t('login.sentHelp');
        $('#codigo').focus();
      } else {
        await Auth.verificar(email, $('#codigo').value.trim());
        S.loaded = false; return render();
      }
    } catch (err) { erro.textContent = err.message || t('err.generic'); }
    b.disabled = false;
  });
}

function telaSenha() {
  modal(`<form id="fSenha" novalidate style="display:flex;flex-direction:column;gap:14px"><h2>${esc(t('pw.title'))}</h2>
    <p class="muted small">${esc(t('pw.sub'))}</p>
    <div class="field"><label class="label" for="nova">${esc(t('pw.new'))}</label><input class="input" id="nova" type="password" autocomplete="new-password"></div>
    <div class="field"><label class="label" for="nova2">${esc(t('pw.repeat'))}</label><input class="input" id="nova2" type="password" autocomplete="new-password"></div>
    <div class="err" id="erroS" role="alert"></div>
    <button class="btn" type="submit">${esc(t('pw.save'))}</button>
    <button class="btn sec" type="button" id="bCanc">${esc(t('pw.cancel'))}</button></form>`);
  $('#nova').focus();
  $('#bCanc').onclick = fecharModal;
  $('#fSenha').addEventListener('submit', async ev => {
    ev.preventDefault();
    const a = $('#nova').value, b = $('#nova2').value, er = $('#erroS');
    if (a.length < 8) { er.textContent = t('pw.short'); return; }
    if (a !== b) { er.textContent = t('pw.mismatch'); return; }
    try { await Auth.definirSenha(a); fecharModal(); aviso(t('pw.saved')); }
    catch (err) { er.textContent = err.message; }
  });
}

function telaSemAcesso() {
  view.innerHTML = `<div class="center">
    <img class="logo" src="assets/logo.png" alt="Oasis Mind">
    <h1>${esc(t('noaccess.title', { email: S.user.email }))}</h1>
    <p class="muted">${esc(t('noaccess.sub'))}</p>
    <a class="btn" href="${esc(CFG.checkout?.anual || CFG.paginaVendas)}">${esc(t('noaccess.buy'))}</a>
    <button class="btn sec" id="re">${esc(t('noaccess.retry'))}</button>
    <button class="btn sec" id="sair">${esc(t('noaccess.other'))}</button>
  </div>`;
  $('#re').onclick = () => { S.loaded = false; render(); };
  $('#sair').onclick = async () => { await Auth.sair(); render(); };
}

/* ---------- Onboarding ---------- */
function telaOnboarding() {
  const d = { name: '', goal: '', morning_time: '08:00', evening_time: '21:00', country: '', ...LS.get('oasis_ob', {}) };
  let passo = 1; const total = 4;
  const guardar = () => LS.set('oasis_ob', d);
  const desenhar = () => {
    let corpo = '';
    if (passo === 1) {
      const goals = ['clarity', 'calm', 'autopilot', 'energy', 'chapter'];
      corpo = `<h1>${esc(t('ob.welcome'))}</h1><p class="muted">${esc(t('ob.welcomeSub'))}</p>
        <div class="field"><label class="label" for="nome">${esc(t('ob.name'))}</label><input class="input" id="nome" autocomplete="given-name" value="${esc(d.name)}"></div>
        <div class="field"><span class="label">${esc(t('ob.goal'))}</span><div class="options">
        ${goals.map(g => `<button type="button" class="option" data-g="${g}" aria-pressed="${d.goal === g}">${esc(t('goal.' + g))}</button>`).join('')}</div></div>`;
    } else if (passo === 2) {
      corpo = `<h1>${esc(t('ob.times'))}</h1>
        <div class="row2"><div class="field"><label class="label" for="am">${esc(t('ob.morning'))}</label><input class="input" type="time" id="am" value="${esc(d.morning_time)}"></div>
        <div class="field"><label class="label" for="pm">${esc(t('ob.evening'))}</label><input class="input" type="time" id="pm" value="${esc(d.evening_time)}"></div></div>`;
    } else if (passo === 3) {
      corpo = `<h1>${esc(t('ob.country'))}</h1><p class="muted">${esc(t('ob.countryWhy'))}</p>
        <div class="field"><label class="sr" for="pais">${esc(t('ob.country'))}</label><select class="input" id="pais"><option value=""></option>
        ${Object.entries(DATA.countries).map(([k, c]) => `<option value="${k}" ${d.country === k ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>`;
    } else {
      corpo = `<h1>${esc(t('ob.privacy'))}</h1>
        <label class="check"><input type="checkbox" id="c1"> <span>${esc(t('ob.consentAi'))}</span></label>
        <label class="check"><input type="checkbox" id="c2"> <span>${esc(t('ob.consentData'))}</span></label>
        <p class="small muted">${esc(t('set.aiText'))}</p>`;
    }
    view.innerHTML = `<div class="progress" aria-hidden="true"><div style="width:${passo / total * 100}%"></div></div>
      ${corpo}<div class="err" id="err"></div>
      <button class="btn" id="next">${esc(passo === total ? t('ob.start') : t('ob.next'))}</button>
      ${passo > 1 ? `<button class="link-btn" id="back">${esc(t('ob.back'))}</button>` : ''}`;
    view.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { d.goal = b.dataset.g; view.querySelectorAll('[data-g]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    if ($('#back')) $('#back').onclick = () => { passo--; desenhar(); };
    $('#next').onclick = async () => {
      if (passo === 1) { d.name = $('#nome').value.trim(); if (!d.name) { $('#nome').focus(); return; } }
      if (passo === 2) { d.morning_time = $('#am').value || '08:00'; d.evening_time = $('#pm').value || '21:00'; }
      if (passo === 3) { d.country = $('#pais').value || 'OTHER'; }
      guardar();
      if (passo < total) { passo++; desenhar(); return; }
      if (!$('#c1').checked || !$('#c2').checked) { $('#err').textContent = t('ob.consentNeeded'); return; }
      $('#next').disabled = true;
      const agora = new Date().toISOString();
      try {
        await Db.salvarPerfil({ ...d, locale: LANG, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, consent_ai_at: agora, consent_sensitive_at: agora, onboarded_at: agora });
        LS.del('oasis_ob'); go('#manha');
      } catch (e) { $('#err').textContent = t('err.generic'); $('#next').disabled = false; }
    };
  };
  desenhar();
}

/* ---------- Hoje ---------- */
function sequencia() {
  const dias = new Set(S.entries.map(e => e.local_date));
  let d = dias.has(hoje()) ? hoje() : somaDias(hoje(), -1), n = 0;
  while (dias.has(d)) { n++; d = somaDias(d, -1); }
  return n;
}
function humorDoDia(d) {
  const ms = S.entries.filter(e => e.local_date === d && e.mood).map(e => e.mood);
  return ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null;
}
function telaHoje() {
  const h = hora();
  const greet = h < 12 ? 'greet.morning' : h < 18 ? 'greet.afternoon' : 'greet.evening';
  const am = entradaHoje('morning'), pm = entradaHoje('evening');
  const noiteAberta = !!am || h >= 15;
  const fio = (S.memory?.open_threads || [])[0];
  const n = sequencia();
  // Semana a começar na segunda-feira
  const dow = (new Date().getDay() + 6) % 7;
  const seg = somaDias(hoje(), -dow);
  const semana = Array.from({ length: 7 }, (_, i) => {
    const d = somaDias(seg, i), m = humorDoDia(d);
    const letra = new Date(...d.split('-').map((v, j) => j === 1 ? v - 1 : +v)).toLocaleDateString(LANG, { weekday: 'narrow' });
    return `<div><i class="${d === hoje() && !m ? 'today' : ''}" style="${m ? `background:${MOOD_COR[m]}` : ''}"></i>${esc(letra)}</div>`;
  }).join('');

  view.innerHTML = `
    <div class="top"><img class="logo" src="assets/logo.png" alt="Oasis Mind"><a class="icon-btn" href="#ajustes" aria-label="${esc(t('nav.settings'))}">${ico('i-gear')}</a></div>
    <div><div class="eyebrow">${esc(dataLonga())}</div><h1>${esc(t(greet, { name: S.profile.name }))}</h1></div>
    <div class="card aqua memory">
      <span class="tag">${ico('i-spark')}${esc(t('today.remembers'))}</span>
      <p>${esc(fio ? fio.question : t('today.firstMemory'))}</p>
      ${fio ? `<a class="btn-white" href="#nota">${esc(t('today.reply'))} ${ico('i-arrow')}</a>` : ''}
    </div>
    <div class="eyebrow">${esc(t('today.ritual'))}</div>
    <a class="ritual" href="${am ? '#resposta-' + am.id : '#manha'}">
      <div class="ico">${ico('i-sun')}</div>
      <div class="txt"><b>${esc(t('today.morning'))}</b><span>${esc(t('today.morningSub'))}</span></div>
      ${am ? `<span class="pill done">${ico('i-check')}${esc(t('today.done'))}</span>` : `<span class="pill">${esc(t('today.start'))}</span>`}
    </a>
    <a class="ritual ${noiteAberta ? '' : 'off'}" href="${pm ? '#resposta-' + pm.id : noiteAberta ? '#noite' : '#hoje'}" ${noiteAberta ? '' : 'aria-disabled="true"'}>
      <div class="ico">${ico('i-moon')}</div>
      <div class="txt"><b>${esc(t('today.evening'))}</b><span>${esc(t('today.eveningSub'))}</span></div>
      ${pm ? `<span class="pill done">${ico('i-check')}${esc(t('today.done'))}</span>` : noiteAberta ? `<span class="pill">${esc(t('today.start'))}</span>` : ico('i-lock')}
    </a>
    <div class="card">
      <div class="bar"><span class="label">${esc(t('today.week'))}</span><span class="small" style="color:var(--teal);font-weight:700">${n ? esc(t('today.streak', { n })) : ''}</span></div>
      <div class="week">${semana}</div>
    </div>
    ${cartaoInstalar()}`;
  ligarInstalar();
}

/* ---------- Check-ins ---------- */
function telaCheckin(kind) {
  const isAm = kind === 'morning', isNota = kind === 'free' || kind === 'sos';
  const ontem = S.entries.find(e => e.kind === 'morning' && e.local_date === hoje());
  const fio = (S.memory?.open_threads || [])[0];
  const pergunta = isAm ? DATA.morningPrompts[hashN(hoje()) % DATA.morningPrompts.length]
    : kind === 'evening' ? (ontem?.evening_question || t('pm.defaultQ'))
    : kind === 'sos' ? t('sos.talk') : (fio?.question || t('today.firstMemory'));
  let mood = 3;
  view.innerHTML = `
    <div class="bar"><a class="icon-btn" href="#hoje" aria-label="${esc(t('common.close'))}">${ico('i-back')}</a><span class="title">${esc(isAm ? t('today.morning') : kind === 'evening' ? t('today.evening') : '')}</span><span style="width:44px"></span></div>
    <h1>${esc(isAm ? t('am.title') : kind === 'evening' ? t('pm.title') : '')}</h1>
    ${isNota ? '' : `<div class="card"><span class="label">${esc(t('mood.label'))}</span><div class="moods">
      ${[1, 2, 3, 4, 5].map(v => `<button type="button" data-m="${v}" aria-pressed="${v === 3}"><i style="background:${MOOD_COR[v]}"></i>${esc(t('mood.' + v))}</button>`).join('')}</div></div>
    <div class="card"><div class="bar"><label class="label" for="en">${esc(t('energy.label'))}</label><span class="small" style="color:var(--teal);font-weight:700" id="enV">3 / 5</span></div>
      <input type="range" id="en" min="1" max="5" step="1" value="3"><div class="range-legend"><span>${esc(t('energy.low'))}</span><span>${esc(t('energy.high'))}</span></div></div>`}
    ${isAm ? `<div class="card field"><label class="label" for="int">${esc(t('am.intention'))}</label><input class="input" id="int" placeholder="${esc(t('am.intentionPh'))}"></div>` : ''}
    ${kind === 'evening' ? `<div class="card field"><label class="label" for="ww">${esc(t('pm.wentWell'))}</label><textarea class="input" id="ww" rows="2"></textarea>
      <label class="label" for="wd">${esc(t('pm.weighed'))}</label><textarea class="input" id="wd" rows="2"></textarea>
      <label class="label" for="gr">${esc(t('pm.gratitude'))}</label><input class="input" id="gr"></div>` : ''}
    <div class="card aqua field">
      ${kind === 'evening' ? `<span class="tag">${ico('i-spark')}${esc(t('pm.asks'))}</span>` : ''}
      <label for="body" style="font-family:var(--serif);font-size:18px;line-height:25px;color:var(--ink-teal)">${esc(pergunta)}</label>
      <div class="write"><textarea class="input" id="body" rows="4" placeholder="${esc(t('entry.ph'))}"></textarea>${micBtn('mic')}</div>
    </div>
    <div class="err" id="err"></div>
    <button class="btn" id="save">${esc(t('entry.save'))}</button>`;
  view.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { mood = +b.dataset.m; view.querySelectorAll('[data-m]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  if ($('#en')) $('#en').oninput = () => { $('#enV').textContent = `${$('#en').value} / 5`; };
  ligarMic($('#mic'), $('#body'));
  $('#save').onclick = async () => {
    const v = id => ($(id)?.value || '').trim();
    const e = { kind, body: v('#body'), prompt: pergunta };
    if (!isNota) { e.mood = mood; e.energy = +$('#en').value; }
    if (isAm) e.intention = v('#int');
    if (kind === 'evening') Object.assign(e, { went_well: v('#ww'), weighed: v('#wd'), gratitude: v('#gr') });
    const texto = [e.body, e.intention, e.went_well, e.weighed].join('').trim();
    if (texto.length < 3) { $('#err').textContent = t('entry.needOne'); return; }
    $('#save').disabled = true; $('#save').textContent = t('entry.saving');
    try {
      const nova = await Db.criarEntrada(e);
      go('#resposta-' + nova.id);
    } catch (err) { $('#err').textContent = t('err.generic'); $('#save').disabled = false; $('#save').textContent = t('entry.save'); }
  };
}

/* ---------- Resposta da IA ---------- */
function telaResposta(id) {
  const e = entrada(id);
  if (!e) { go('#hoje'); return; }
  const blocoMe = txt => `<div class="bubble-me">${txt}</div>`;
  const blocoAi = txt => `<div class="bubble-ai"><div class="av"><img src="assets/symbol.png" alt=""></div><div class="msg">${txt}</div></div>`;
  const chips = [e.mood ? `<span class="chip">${esc(t('mood.label'))} · ${esc(t('mood.' + e.mood))}</span>` : '', e.energy ? `<span class="chip teal">${esc(t('energy.label'))} · ${e.energy}/5</span>` : ''].join(' ');
  const partes = [e.intention && `<b>${esc(t('am.intention'))}:</b> ${esc(e.intention)}`, e.went_well && `<b>${esc(t('pm.wentWell'))}</b> ${esc(e.went_well)}`, e.weighed && `<b>${esc(t('pm.weighed'))}</b> ${esc(e.weighed)}`, e.gratitude && `<b>${esc(t('pm.gratitude'))}:</b> ${esc(e.gratitude)}`, e.body && esc(e.body)].filter(Boolean);
  const tip = DATA.tips[hashN(e.id) % DATA.tips.length];

  const desenhar = (carregando = false, erro = '') => {
    const conversa = (e.followups || []).map(f => f.role === 'user' ? blocoMe(`<p>${esc(f.text)}</p>`) : blocoAi(esc(f.text))).join('');
    const riscoMedio = e.risk === 'medium';
    view.innerHTML = `
      <div class="bar"><a class="icon-btn" href="#hoje" aria-label="${esc(t('common.close'))}">${ico('i-back')}</a><span class="title">${esc(dataCurta(e.local_date))}</span><span style="width:44px"></span></div>
      ${blocoMe(`${chips ? `<div>${chips}</div>` : ''}${partes.map(p => `<p style="font-size:15px;line-height:22px">${p}</p>`).join('')}`)}
      ${e.ai_reply ? blocoAi(esc(e.ai_reply)) : carregando ? blocoAi('<span class="typing"><i></i><i></i><i></i></span>') : ''}
      ${conversa}
      ${carregando && e.ai_reply ? blocoAi('<span class="typing"><i></i><i></i><i></i></span>') : ''}
      ${erro ? `<p class="err">${esc(erro)}</p>` : ''}
      ${riscoMedio ? linhaAjuda() : ''}
      ${e.ai_reply ? `<div class="tip">${ico('i-bulb')}<p><b>${esc(t('reply.why'))}</b> ${esc(tip)}</p></div>` : ''}
      ${e.ai_reply && (e.followups || []).length < 6 ? `<div class="field" style="margin-top:auto">
        <label class="small muted" for="ans" style="font-weight:700">${esc(t('reply.answer'))}</label>
        <div class="write"><textarea class="input" id="ans" rows="2" placeholder="${esc(t('reply.answerPh'))}" style="min-height:52px"></textarea>
        <button type="button" class="send outline" id="mic2" aria-pressed="false" aria-label="${esc(t('mic.label'))}">${ico('i-mic')}<span class="sr">${esc(t('mic.speak'))}</span></button>
        <button type="button" class="send" id="send" aria-label="${esc(t('reply.send'))}">${ico('i-arrow')}</button></div></div>` : ''}
      <div class="bar"><span class="small muted">${esc(t('reply.disclaimer'))}</span><a class="link-btn" href="#hoje">${esc(t('reply.done'))}</a></div>`;
    if ($('#ans')) {
      ligarMic($('#mic2'), $('#ans'));
      $('#send').onclick = async () => {
        const msg = $('#ans').value.trim(); if (!msg) return;
        e.followups = [...(e.followups || []), { role: 'user', text: msg }];
        desenhar(true);
        e.followups = e.followups.slice(0, -1);
        try { const out = await pedirIA(e, 'followup', msg); if (out.risk === 'high') return telaCrise(); desenhar(); }
        catch (err) { desenhar(false, err.message); }
      };
    }
  };
  if (!e.ai_reply) {
    desenhar(true);
    pedirIA(e).then(out => { if (out.risk === 'high') telaCrise(); else desenhar(); })
      .catch(err => desenhar(false, err.offline ? t('reply.waiting') : err.message));
  } else desenhar();
}

/* ---------- Crise ---------- */
function linhaAjuda() {
  const p = pais();
  return `<button class="help-row" id="ajuda" style="border:0;text-align:left;cursor:pointer">${ico('i-phone')}
    <span style="flex:1;display:flex;flex-direction:column;gap:2px"><b style="font-size:14px">${esc(t('sos.help'))}</b><span class="small muted">${esc(t('sos.helpSub', { country: p.name }))}</span></span>
    <span class="link-btn">${esc(t('sos.view'))}</span></button>`;
}
function listaLinhas() {
  const p = pais();
  return `<div class="card">
    <div class="line"><span><b>${esc(t('crisis.emergency', { n: p.emergency }))}</b></span><a class="btn small teal" href="tel:${esc(p.emergency)}">${esc(t('crisis.call'))}</a></div>
    ${p.lines.map(l => `<div class="line"><span>${esc(l.name)}<br><span class="small muted">${esc(l.phone)}</span></span><a class="btn small teal" href="tel:${esc(l.phone.replace(/\s/g, ''))}">${esc(t('crisis.call'))}</a></div>`).join('')}
    <div class="line"><a class="link-btn" href="https://findahelpline.com" target="_blank" rel="noopener">${esc(t('crisis.find'))}</a></div>
  </div>`;
}
function telaCrise() {
  view.innerHTML = `
    <div class="bar"><a class="icon-btn" href="#hoje" aria-label="${esc(t('common.close'))}">${ico('i-close')}</a><span></span><span style="width:44px"></span></div>
    <h1>${esc(t('crisis.title'))}</h1>
    <p>${esc(t('crisis.body'))}</p>
    ${listaLinhas()}
    <a class="btn sec" href="#sos">${esc(t('nav.sos'))}</a>
    <a class="link-btn" href="#hoje">${esc(t('crisis.back'))}</a>`;
}
document.addEventListener('click', ev => {
  if (ev.target.closest('#ajuda')) modal(`<h2>${esc(t('sos.help'))}</h2>${listaLinhas()}<button class="btn sec" onclick="document.getElementById('modal').hidden=true">${esc(t('common.close'))}</button>`);
});

/* ---------- Diário ---------- */
function telaDiario() {
  const KIND = { morning: 'journal.morning', evening: 'journal.evening', sos: 'journal.sos', free: 'journal.free' };
  view.innerHTML = `<h1>${esc(t('journal.title'))}</h1>
    ${S.entries.length ? S.entries.map(e => `<a class="entry" href="#resposta-${esc(e.id)}" style="text-decoration:none;color:inherit">
      <div class="meta"><span>${esc(t(KIND[e.kind] || 'journal.free'))} · ${esc(dataCurta(e.local_date))}</span>${e.mood ? `<span>${esc(t('mood.' + e.mood))}</span>` : ''}</div>
      <p style="font-size:15px">${esc((e.body || e.weighed || e.went_well || e.intention || '').slice(0, 180))}</p>
      ${e.ai_reply ? `<p class="ai">${esc(e.ai_reply.slice(0, 160))}${e.ai_reply.length > 160 ? '…' : ''}</p>` : ''}
    </a>`).join('') : `<p class="muted">${esc(t('journal.empty'))}</p>`}`;
}

/* ---------- Insights ---------- */
function telaInsights() {
  const dias = Array.from({ length: 7 }, (_, i) => somaDias(hoje(), i - 6));
  const media = (d, k) => { const v = S.entries.filter(e => e.local_date === d && e[k]).map(e => e[k]); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const W = 310, H = 120, step = W / 7;
  const barras = dias.map((d, i) => { const m = media(d, 'mood'); if (!m) return ''; const h = m / 5 * 100; return `<rect x="${Math.round(i * step + (step - 22) / 2)}" y="${Math.round(110 - h)}" width="22" height="${Math.round(h)}" rx="6" fill="${m >= 4 ? '#7C3AED' : '#D9C9F7'}"/>`; }).join('');
  const pts = dias.map((d, i) => { const v = media(d, 'energy'); return v ? `${Math.round(i * step + step / 2)},${Math.round(110 - v / 5 * 100)}` : null; }).filter(Boolean);
  const temDados = !!barras.trim();
  const ult7 = S.entries.filter(e => e.local_date >= dias[0]);
  const ativos = new Set(ult7.map(e => e.local_date)).size;
  const w = S.weekly?.report;
  const nota = (tipo, txt) => `<div class="note"><span class="chip white" style="flex-shrink:0;${tipo === 'win' ? 'color:var(--teal)' : ''}">${esc(t('ins.' + tipo))}</span><span>${esc(txt)}</span></div>`;
  view.innerHTML = `
    <div><div class="eyebrow">${esc(t('ins.title'))}</div><h1>${esc(w?.headline || t('ins.chart'))}</h1></div>
    <div class="card">
      <div class="bar"><span class="label">${esc(t('ins.chart'))}</span><div class="legend"><span><i style="width:10px;height:10px;border-radius:5px;background:var(--purple);display:block"></i>${esc(t('mood.label'))}</span><span><i style="width:10px;height:3px;background:var(--teal);display:block"></i>${esc(t('energy.label'))}</span></div></div>
      ${temDados ? `<div class="chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(t('ins.chart'))}">
        <line x1="0" y1="110" x2="${W}" y2="110" stroke="#EDE6DA" stroke-width="1"/>${barras}
        ${pts.length > 1 ? `<polyline points="${pts.join(' ')}" fill="none" stroke="#0E5C52" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}</svg></div>
        <div class="days7">${dias.map(d => `<span>${esc(new Date(...d.split('-').map((v, j) => j === 1 ? v - 1 : +v)).toLocaleDateString(LANG, { weekday: 'narrow' }))}</span>`).join('')}</div>`
      : `<p class="small muted">${esc(t('ins.chartEmpty'))}</p>`}
    </div>
    <div class="stats"><div><b>${sequencia()}</b><span>${esc(t('ins.streak'))}</span></div><div><b>${ult7.length}</b><span>${esc(t('ins.entries'))}</span></div><div><b>${ativos}</b><span>${esc(t('ins.days'))}</span></div></div>
    ${w ? `<div class="card aqua"><span class="tag">${esc(t('ins.noticed'))}</span>
        ${(w.triggers || []).map(x => nota('trigger', x)).join('')}${(w.patterns || []).map(x => nota('pattern', x)).join('')}${(w.wins || []).map(x => nota('win', x)).join('')}</div>
      ${w.focus ? `<div class="card"><span class="eyebrow">${esc(t('ins.focus'))}</span><b style="font-size:16px">${esc(w.focus)}</b></div>` : ''}`
    : `<div class="card aqua"><p>${esc(t('ins.waiting', { n: S.entries.length }))}</p></div>`}`;
}

/* ---------- SOS ---------- */
let sosTimer = null;
function telaSOS() {
  const FASES = [{ k: 'sos.in', ms: 2000, s: .9, a: 'in' }, { k: 'sos.in2', ms: 1200, s: 1, a: 'in-again' }, { k: 'sos.out', ms: 6000, s: .7, a: 'out' }];
  let resta = 120, fase = 0, rodando = false, vozOn = !!CFG.audioSOS, prox = 0, tic = null;
  const audio = n => { if (!vozOn) return; try { new Audio(`assets/audio/${n}.mp3`).play().catch(() => {}); } catch (e) {} };
  view.innerHTML = `
    <div class="bar"><a class="icon-btn" href="#hoje" aria-label="${esc(t('sos.close'))}">${ico('i-close')}</a><span class="title">SOS · 2 min</span>
      ${CFG.audioSOS ? `<button class="icon-btn" id="voz" aria-pressed="true" aria-label="${esc(t('sos.voice'))}">${ico('i-mic')}</button>` : '<span style="width:44px"></span>'}</div>
    <div style="text-align:center;display:flex;flex-direction:column;gap:6px"><h1>${esc(t('sos.title'))}</h1><p class="muted">${esc(t('sos.sub'))}</p></div>
    <div class="orb-wrap"><div class="orb-bg"><div class="orb" id="orb"><div class="mid"><div class="core"></div></div></div></div></div>
    <div style="text-align:center"><div class="phase" id="fase" aria-live="polite"></div><div class="small muted" id="resta" style="font-weight:700"></div></div>
    <div class="row2"><button class="btn sec" id="pp">${esc(t('sos.start'))}</button><a class="btn" href="#sos-nota">${esc(t('sos.talk'))}</a></div>
    ${linhaAjuda()}`;
  const fmt = s => `${Math.floor(s / 60)}:${pad(s % 60)}`;
  $('#resta').textContent = t('sos.left', { t: fmt(resta) });
  const passo = () => {
    if (!document.getElementById('orb')) return parar();
    const f = FASES[fase];
    $('#orb').style.transitionDuration = f.ms + 'ms';
    $('#orb').style.transform = `scale(${f.s})`;
    $('#fase').textContent = t(f.k); audio(f.a);
    fase = (fase + 1) % FASES.length;
    prox = setTimeout(passo, f.ms);
  };
  const parar = () => { clearTimeout(prox); clearInterval(tic); rodando = false; };
  const iniciar = () => {
    rodando = true; $('#pp').textContent = t('sos.pause');
    if (resta === 120) audio('intro');
    passo();
    tic = setInterval(() => {
      if (!document.getElementById('resta')) return parar();
      resta--; $('#resta').textContent = t('sos.left', { t: fmt(resta) });
      if (resta <= 0) { parar(); $('#fase').textContent = t('sos.end'); audio('end'); $('#orb').style.transform = 'scale(.8)'; $('#pp').textContent = t('sos.start'); resta = 120; }
    }, 1000);
  };
  $('#pp').onclick = () => { if (rodando) { parar(); $('#pp').textContent = t('sos.resume'); } else iniciar(); };
  if ($('#voz')) $('#voz').onclick = () => { vozOn = !vozOn; $('#voz').setAttribute('aria-pressed', vozOn); };
  sosTimer = parar;
}

/* ---------- Ajustes ---------- */
function telaAjustes() {
  const p = S.profile;
  view.innerHTML = `
    <div class="bar"><a class="icon-btn" href="#hoje" aria-label="${esc(t('common.close'))}">${ico('i-back')}</a><span class="title">${esc(t('set.title'))}</span><span style="width:44px"></span></div>
    <div class="card field">
      <span class="label">${esc(t('set.profile'))}</span>
      <label class="small muted" for="nome">${esc(t('ob.name'))}</label><input class="input" id="nome" value="${esc(p.name)}">
      <div class="row2"><div class="field"><label class="small muted" for="am">${esc(t('ob.morning'))}</label><input class="input" type="time" id="am" value="${esc(p.morning_time)}"></div>
      <div class="field"><label class="small muted" for="pm">${esc(t('ob.evening'))}</label><input class="input" type="time" id="pm" value="${esc(p.evening_time)}"></div></div>
      <label class="small muted" for="pais">${esc(t('ob.country'))}</label><select class="input" id="pais">${Object.entries(DATA.countries).map(([k, c]) => `<option value="${k}" ${p.country === k ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <button class="btn small teal" id="salvar" style="align-self:flex-start">${esc(t('set.save'))}</button>
    </div>
    <div class="card"><span class="label">${esc(t('set.reminders'))}</span><p class="small muted">${esc(t('set.remindersSub'))}</p><p class="small muted" id="pushMsg"></p>
      <button class="btn small sec" id="push" style="align-self:flex-start;background:var(--bg)">${esc(t('set.enable'))}</button></div>
    <div class="card"><span class="label">${esc(t('set.aiTitle'))}</span><p class="small">${esc(t('set.aiText'))}</p><p class="small muted">${esc(t('set.disclaimer'))}</p></div>
    <div class="card"><span class="label">${esc(t('set.data'))}</span>
      <button class="link-btn" id="pw" style="justify-content:flex-start">${esc(t('set.password'))}</button>
      <button class="link-btn" id="exp" style="justify-content:flex-start">${esc(t('set.export'))}</button>
      <button class="link-btn" id="del" style="justify-content:flex-start;color:#B42318">${esc(t('set.delete'))}</button></div>
    <div class="card"><span class="label">${esc(t('set.support'))}</span><a href="mailto:${esc(CFG.suporteEmail)}">${esc(CFG.suporteEmail)}</a>
      <button class="link-btn" id="inst" style="justify-content:flex-start">${esc(t('set.install'))}</button></div>
    <button class="btn sec" id="sair">${esc(t('set.signout'))}</button>`;
  $('#salvar').onclick = async () => {
    try { await Db.salvarPerfil({ name: $('#nome').value.trim() || p.name, morning_time: $('#am').value, evening_time: $('#pm').value, country: $('#pais').value }); aviso(t('set.saved')); }
    catch (e) { aviso(t('err.generic')); }
  };
  $('#push').onclick = ativarPush;
  $('#pw').onclick = telaSenha;
  $('#inst').onclick = instrucoesInstalar;
  $('#exp').onclick = async () => {
    const dados = await Db.exportar();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }));
    a.download = `oasis-mind-export-${hoje()}.json`; a.click();
  };
  $('#del').onclick = () => {
    modal(`<h2>${esc(t('set.delete'))}</h2><p>${esc(t('set.deleteConfirm'))}</p><input class="input" id="conf" autocomplete="off"><div class="err" id="derr"></div>
      <button class="btn" id="ok" style="background:#B42318">${esc(t('set.delete'))}</button><button class="btn sec" id="nao">${esc(t('common.close'))}</button>`);
    $('#nao').onclick = fecharModal;
    $('#ok').onclick = async () => {
      if ($('#conf').value.trim() !== 'DELETE') { $('#derr').textContent = t('set.deleteConfirm'); return; }
      try { await Db.apagarConta(); fecharModal(); await Auth.sair(); aviso(t('set.deleted')); render(); }
      catch (e) { $('#derr').textContent = t('err.generic'); }
    };
  };
  $('#sair').onclick = async () => { await Auth.sair(); render(); };
}

/* ---------- Instalação e push ---------- */
let promptInstalar = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInstalar = e; });
const instalado = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
function cartaoInstalar() {
  if (instalado() || LS.get('oasis_install_hide', false)) return '';
  return `<div class="card ghost"><p class="small">${esc(t('today.install'))}</p><div class="bar"><button class="btn small teal" id="instBtn">${esc(t('today.installBtn'))}</button><button class="link-btn" id="instHide">${esc(t('common.close'))}</button></div></div>`;
}
function ligarInstalar() {
  if ($('#instBtn')) $('#instBtn').onclick = instrucoesInstalar;
  if ($('#instHide')) $('#instHide').onclick = () => { LS.set('oasis_install_hide', true); render(); };
}
async function instrucoesInstalar() {
  if (promptInstalar) { promptInstalar.prompt(); promptInstalar = null; return; }
  modal(`<h2>${esc(t('install.title'))}</h2><p>${esc(t('install.ios'))}</p><p>${esc(t('install.android'))}</p><button class="btn" id="okI">${esc(t('install.ok'))}</button>`);
  $('#okI').onclick = fecharModal;
}
function chaveVapid(b64) { const p = '='.repeat((4 - b64.length % 4) % 4); const r = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); }
async function ativarPush() {
  const msg = $('#pushMsg');
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || !CFG.vapidPublicKey) { msg.textContent = t('set.pushUnsupported'); return; }
    if (await Notification.requestPermission() !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveVapid(CFG.vapidPublicKey) });
    if (!DEMO) await S.sb.from('push_subscriptions').upsert({ endpoint: sub.endpoint, user_id: S.user.id, subscription: sub.toJSON() });
    msg.textContent = t('set.enabled');
  } catch (e) { msg.textContent = t('set.pushUnsupported'); }
}

/* ---------- Roteamento ---------- */
async function render() {
  if (sosTimer) { sosTimer(); sosTimer = null; }
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  $('#demoBar').hidden = !(DEMO && S.user); $('#demoBar').textContent = t('demo.bar');
  const tabs = $('#tabs');
  if (!S.user) { tabs.hidden = true; return telaLogin(); }
  if (!S.loaded) {
    view.innerHTML = '<div class="center" style="align-items:center"><span class="typing"><i></i><i></i><i></i></span></div>';
    try { await Db.carregar(); } catch (e) { view.innerHTML = `<div class="center"><p>${esc(t('err.generic'))}</p></div>`; return; }
  }
  if (!S.access) { tabs.hidden = true; return telaSemAcesso(); }
  if (!S.profile?.onboarded_at) { tabs.hidden = true; return telaOnboarding(); }
  const h = (location.hash || '#hoje').slice(1);
  const rota = h.split('-')[0];
  const comTabs = ['hoje', 'diario', 'insights'].includes(rota);
  tabs.hidden = !comTabs;
  tabs.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.tab === rota && rota !== 'sos'));
  if (rota === 'manha') telaCheckin('morning');
  else if (rota === 'noite') telaCheckin('evening');
  else if (rota === 'nota') telaCheckin('free');
  else if (h === 'sos-nota') telaCheckin('sos');
  else if (rota === 'resposta') telaResposta(h.slice('resposta-'.length));
  else if (rota === 'diario') telaDiario();
  else if (rota === 'insights') telaInsights();
  else if (rota === 'sos') telaSOS();
  else if (rota === 'ajustes') telaAjustes();
  else telaHoje();
  window.scrollTo(0, 0);
  view.focus({ preventScroll: true });
}
window.addEventListener('hashchange', render);

(async () => {
  try { await iniciarSupabase(); } catch (e) { console.error(e); }
  if (S.sb) S.sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'SIGNED_IN' && session && !S.user) { S.user = { id: session.user.id, email: session.user.email }; S.loaded = false; render(); }
  });
  render();
})();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  try { navigator.serviceWorker.register('/sw.js').catch(() => {}); } catch (e) {}
}
}
