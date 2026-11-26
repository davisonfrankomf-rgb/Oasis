// Oasis Mind — app (PWA, sem build e sem IA).
// Rotas por hash: #hoje #escrever #diario #entrada-ID #foco #respirar #lembretes #ajustes
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
const deIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const somaDias = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return iso(d); };
const dataLonga = () => new Date().toLocaleDateString(LANG, { weekday: 'long', day: 'numeric', month: 'long' });
const dataCurta = s => deIso(s).toLocaleDateString(LANG, { weekday: 'short', day: 'numeric', month: 'short' });
const letraDia = s => deIso(s).toLocaleDateString(LANG, { weekday: 'narrow' });
const horaTxt = ts => new Date(ts).toLocaleTimeString(LANG, { hour: '2-digit', minute: '2-digit' });
const palavras = txt => (String(txt || '').trim().match(/\S+/g) || []).length;
const mmss = s => `${Math.floor(s / 60)}:${pad(Math.max(0, s % 60))}`;

/* ---------- Estado ---------- */
const S = { user: null, sb: null, access: false, profile: null, entries: [], reminders: [], focus: [], loaded: false };

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
    Object.assign(S, { user: null, profile: null, entries: [], reminders: [], focus: [], loaded: false });
    LS.del('oasis_demo_user');
  }
};

/* ---------- Dados ---------- */
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'd' + Date.now() + Math.random().toString(16).slice(2));
const Db = {
  async carregar() {
    if (DEMO) {
      S.access = true;
      S.profile = LS.get('oasis_profile', null);
      S.entries = LS.get('oasis_entries', []);
      S.reminders = LS.get('oasis_reminders', []);
      S.focus = LS.get('oasis_focus_sessions', []);
      S.loaded = true; return;
    }
    const desde = somaDias(hoje(), -90);
    const [compras, perfil, entradas, lembretes, foco] = await Promise.all([
      S.sb.from('purchases').select('product,status').eq('status', 'active'),
      S.sb.from('profiles').select('*').eq('user_id', S.user.id).maybeSingle(),
      S.sb.from('entries').select('id,kind,local_date,mood,energy,prompt,body,created_at').gte('local_date', desde).order('created_at', { ascending: false }).limit(300),
      S.sb.from('reminders').select('*').order('time'),
      S.sb.from('focus_sessions').select('*').gte('local_date', somaDias(hoje(), -30)).order('started_at', { ascending: false }).limit(200)
    ]);
    S.access = (compras.data || []).length > 0;
    S.profile = perfil.data || null;
    S.entries = entradas.data || [];
    S.reminders = lembretes.data || [];
    S.focus = foco.data || [];
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
    const row = { id: uid(), kind: 'journal', local_date: hoje(), created_at: new Date().toISOString(), ...e };
    if (DEMO) { S.entries.unshift(row); LS.set('oasis_entries', S.entries); return row; }
    const { data, error } = await S.sb.from('entries').insert({ ...row, user_id: S.user.id }).select('id,kind,local_date,mood,energy,prompt,body,created_at').single();
    if (error) throw error;
    S.entries.unshift(data); return data;
  },
  async apagarEntrada(id) {
    if (!DEMO) { const { error } = await S.sb.from('entries').delete().eq('id', id); if (error) throw error; }
    S.entries = S.entries.filter(e => e.id !== id);
    if (DEMO) LS.set('oasis_entries', S.entries);
  },
  async salvarLembrete(r) {
    const row = { ...r, id: r.id || uid(), user_id: S.user.id };
    if (DEMO) {
      S.reminders = [...S.reminders.filter(x => x.id !== row.id), row].sort((a, b) => a.time.localeCompare(b.time));
      LS.set('oasis_reminders', S.reminders); return row;
    }
    const { data, error } = await S.sb.from('reminders').upsert(row).select().single();
    if (error) throw error;
    S.reminders = [...S.reminders.filter(x => x.id !== data.id), data].sort((a, b) => a.time.localeCompare(b.time));
    return data;
  },
  async apagarLembrete(id) {
    if (!DEMO) { const { error } = await S.sb.from('reminders').delete().eq('id', id); if (error) throw error; }
    S.reminders = S.reminders.filter(r => r.id !== id);
    if (DEMO) LS.set('oasis_reminders', S.reminders);
  },
  async salvarFoco(f) {
    const row = { id: uid(), ...f };
    S.focus.unshift(row);
    if (DEMO) { LS.set('oasis_focus_sessions', S.focus); return; }
    const { error } = await S.sb.from('focus_sessions').insert({ ...row, user_id: S.user.id });
    if (error) console.error(error);
  },
  async exportar() {
    if (DEMO) return { profile: S.profile, entries: S.entries, reminders: S.reminders, focus_sessions: S.focus };
    const [p, e, r, f] = await Promise.all([
      S.sb.from('profiles').select('*').eq('user_id', S.user.id).maybeSingle(),
      S.sb.from('entries').select('*').order('created_at'),
      S.sb.from('reminders').select('*'),
      S.sb.from('focus_sessions').select('*').order('started_at')
    ]);
    return { exported_at: new Date().toISOString(), email: S.user.email, profile: p.data, entries: e.data, reminders: r.data, focus_sessions: f.data };
  },
  async apagarConta() {
    if (DEMO) { ['oasis_profile', 'oasis_entries', 'oasis_reminders', 'oasis_focus_sessions', 'oasis_focus_run'].forEach(LS.del); return; }
    const r = await fetch('/api/delete-account', { method: 'POST', headers: { Authorization: `Bearer ${await token()}` } });
    if (!r.ok) throw new Error(t('err.generic'));
  }
};

/* ---------- Utilidades de interface ---------- */
let tAviso;
function aviso(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(tAviso); tAviso = setTimeout(() => el.classList.remove('on'), 3200); }
function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.hidden = false; m.onclick = ev => { if (ev.target === m) fecharModal(); }; }
function fecharModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
function confirmar(msg) {
  return new Promise(ok => {
    modal(`<p style="font-size:17px">${esc(msg)}</p><div class="row2"><button class="btn sec" id="cNo">${esc(t('common.no'))}</button><button class="btn" id="cYes">${esc(t('common.yes'))}</button></div>`);
    $('#cNo').onclick = () => { fecharModal(); ok(false); };
    $('#cYes').onclick = () => { fecharModal(); ok(true); };
  });
}
const go = h => { if (location.hash === h) render(); else location.hash = h; };
const pais = () => DATA.countries[S.profile?.country] || DATA.countries.OTHER;
const MOOD_COR = { 1: '#BDA4F2', 2: '#D9C9F7', 3: '#E2D9CC', 4: '#9FDCD2', 5: '#4FB3A5' };
const hashN = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const RISCO = /\b(kill myself|end my life|suicid\w*|want to die|wanna die|self[- ]?harm|hurt myself|cut myself|no reason to live|better off dead|overdos\w*|umbringen|selbstmord|suizid|me suicider|suicidarme|matarme|matar-me|suicidar)\b/i;

function ligarMic(btn, campo) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { btn.remove(); return; }
  let rec = null; const ph = campo.placeholder;
  btn.onclick = () => {
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = SPEECH_LANG[LANG] || 'en-GB'; rec.continuous = true; rec.interimResults = false;
    const base = campo.value; let dito = '';
    rec.onresult = ev => { for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) dito += ev.results[i][0].transcript + ' '; campo.value = (base ? base.trim() + ' ' : '') + dito.trim(); campo.dispatchEvent(new Event('input')); };
    rec.onend = () => { rec = null; btn.setAttribute('aria-pressed', 'false'); btn.querySelector('span').textContent = t('mic.speak'); campo.placeholder = ph; };
    rec.onerror = () => rec && rec.stop();
    rec.start();
    btn.setAttribute('aria-pressed', 'true'); btn.querySelector('span').textContent = t('mic.stop'); campo.placeholder = t('mic.listening');
  };
}

/* ---------- Login (padrão Inabaláveis) ---------- */
function telaLogin() {
  view.innerHTML = `<section class="login">
    <div class="login-hero"><img src="assets/logo.png" alt="Oasis Mind"><p>${esc(t('app.tagline'))}</p></div>
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
      if (modoSenha) { await Auth.entrarSenha(email, $('#senha').value); S.loaded = false; return render(); }
      if (etapa === 1) {
        await Auth.enviar(email);
        etapa = 2; $('#wrapCod').hidden = false; $('#email').readOnly = true; b.textContent = t('login.enterCode');
        $('#ajuda').textContent = DEMO ? t('login.demo') : t('login.sentHelp'); $('#codigo').focus();
      } else { await Auth.verificar(email, $('#codigo').value.trim()); S.loaded = false; return render(); }
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
    try { await Auth.definirSenha(a); fecharModal(); aviso(t('pw.saved')); } catch (err) { er.textContent = err.message; }
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
const DIAS_TODOS = [0, 1, 2, 3, 4, 5, 6];
function telaOnboarding() {
  const d = { name: '', goal: '', am: '08:00', pm: '21:30', country: '', ...LS.get('oasis_ob', {}) };
  let passo = 1; const total = 4;
  const desenhar = () => {
    let corpo = '';
    if (passo === 1) {
      const goals = ['clarity', 'calm', 'burnout', 'autopilot', 'focus'];
      corpo = `<h1>${esc(t('ob.welcome'))}</h1><p class="muted">${esc(t('ob.welcomeSub'))}</p>
        <div class="field"><label class="label" for="nome">${esc(t('ob.name'))}</label><input class="input" id="nome" autocomplete="given-name" value="${esc(d.name)}"></div>
        <div class="field"><span class="label">${esc(t('ob.goal'))}</span><div class="options">
        ${goals.map(g => `<button type="button" class="option" data-g="${g}" aria-pressed="${d.goal === g}">${esc(t('goal.' + g))}</button>`).join('')}</div></div>`;
    } else if (passo === 2) {
      corpo = `<h1>${esc(t('ob.times'))}</h1><p class="muted">${esc(t('ob.timesSub'))}</p>
        <div class="row2"><div class="field"><label class="label" for="am">${esc(t('ob.morning'))}</label><input class="input" type="time" id="am" value="${esc(d.am)}"></div>
        <div class="field"><label class="label" for="pm">${esc(t('ob.evening'))}</label><input class="input" type="time" id="pm" value="${esc(d.pm)}"></div></div>`;
    } else if (passo === 3) {
      corpo = `<h1>${esc(t('ob.country'))}</h1><p class="muted">${esc(t('ob.countryWhy'))}</p>
        <div class="field"><label class="sr" for="pais">${esc(t('ob.country'))}</label><select class="input" id="pais"><option value=""></option>
        ${Object.entries(DATA.countries).map(([k, c]) => `<option value="${k}" ${d.country === k ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>`;
    } else {
      corpo = `<h1>${esc(t('ob.privacy'))}</h1>
        <label class="check"><input type="checkbox" id="c1"> <span>${esc(t('ob.consentData'))}</span></label>
        <p class="small muted">${esc(t('ob.privacyNote'))}</p>`;
    }
    view.innerHTML = `<div class="progress" aria-hidden="true"><div style="width:${passo / total * 100}%"></div></div>
      ${corpo}<div class="err" id="err"></div>
      <button class="btn" id="next">${esc(passo === total ? t('ob.start') : t('ob.next'))}</button>
      ${passo > 1 ? `<button class="link-btn" id="back">${esc(t('ob.back'))}</button>` : ''}`;
    view.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { d.goal = b.dataset.g; view.querySelectorAll('[data-g]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    if ($('#back')) $('#back').onclick = () => { passo--; desenhar(); };
    $('#next').onclick = async () => {
      if (passo === 1) { d.name = $('#nome').value.trim(); if (!d.name) { $('#nome').focus(); return; } }
      if (passo === 2) { d.am = $('#am').value || '08:00'; d.pm = $('#pm').value || '21:30'; }
      if (passo === 3) { d.country = $('#pais').value || 'OTHER'; }
      LS.set('oasis_ob', d);
      if (passo < total) { passo++; desenhar(); return; }
      if (!$('#c1').checked) { $('#err').textContent = t('ob.consentNeeded'); return; }
      $('#next').disabled = true;
      const agora = new Date().toISOString();
      try {
        await Db.salvarPerfil({ name: d.name, goal: d.goal, country: d.country, morning_time: d.am, evening_time: d.pm, locale: LANG, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, consent_sensitive_at: agora, onboarded_at: agora });
        if (!S.reminders.length) {
          await Db.salvarLembrete({ purpose: 'journal', label: t('purpose.journal'), message: t('purposeMsg.journal'), time: d.am, days: DIAS_TODOS, enabled: true });
          await Db.salvarLembrete({ purpose: 'gratitude', label: t('purpose.gratitude'), message: t('purposeMsg.gratitude'), time: d.pm, days: DIAS_TODOS, enabled: true });
        }
        LS.del('oasis_ob'); go('#escrever');
      } catch (e) { console.error(e); $('#err').textContent = t('err.generic'); $('#next').disabled = false; }
    };
  };
  desenhar();
}

/* ---------- Estatísticas ---------- */
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
const minutosFoco = desde => Math.round(S.focus.filter(f => f.local_date >= desde).reduce((a, f) => a + (f.actual_seconds || 0), 0) / 60);
function proximoLembrete() {
  const ativos = S.reminders.filter(r => r.enabled && (r.days || []).length);
  if (!ativos.length) return null;
  const agora = new Date(); const min = agora.getHours() * 60 + agora.getMinutes();
  for (let add = 0; add < 8; add++) {
    const dia = (agora.getDay() + add) % 7;
    const cands = ativos.filter(r => r.days.includes(dia)).map(r => ({ r, m: +r.time.slice(0, 2) * 60 + +r.time.slice(3, 5) })).filter(x => add > 0 || x.m > min).sort((a, b) => a.m - b.m);
    if (cands.length) return { r: cands[0].r, add };
  }
  return null;
}

/* ---------- Hoje ---------- */
function telaHoje() {
  const h = new Date().getHours();
  const greet = h < 12 ? 'greet.morning' : h < 18 ? 'greet.afternoon' : 'greet.evening';
  const escritoHoje = S.entries.some(e => e.local_date === hoje());
  const n = sequencia();
  const dow = (new Date().getDay() + 6) % 7;
  const seg = somaDias(hoje(), -dow);
  const semana = Array.from({ length: 7 }, (_, i) => {
    const d = somaDias(seg, i), m = humorDoDia(d), escrito = S.entries.some(e => e.local_date === d);
    const cor = m ? MOOD_COR[m] : escrito ? '#9FDCD2' : '';
    return `<div><i class="${d === hoje() && !escrito ? 'today' : ''}" style="${cor ? `background:${cor}` : ''}"></i>${esc(letraDia(d))}</div>`;
  }).join('');
  const prox = proximoLembrete();
  const passado = S.entries.find(e => e.local_date === somaDias(hoje(), -7) && e.body);
  const tip = DATA.tips[hashN(hoje()) % DATA.tips.length];

  view.innerHTML = `
    <div class="top"><img class="logo" src="assets/logo.png" alt="Oasis Mind"><a class="icon-btn" href="#ajustes" aria-label="${esc(t('nav.settings'))}">${ico('i-gear')}</a></div>
    <div><div class="eyebrow">${esc(dataLonga())}</div><h1>${esc(t(greet, { name: S.profile.name }))}</h1></div>
    <a class="card aqua hero-write" href="#escrever">
      <span class="tag">${ico('i-pen')}${esc(escritoHoje ? t('today.writtenToday') : t('today.write'))}</span>
      <p class="serif-lg">${esc(DATA.journalPrompts[hashN(hoje()) % DATA.journalPrompts.length])}</p>
      <span class="btn-white">${esc(escritoHoje ? t('today.writeMore') : t('today.writeSub'))} ${ico('i-arrow')}</span>
    </a>
    <div class="eyebrow">${esc(t('today.tools'))}</div>
    <div class="row2">
      <a class="tool" href="#foco"><span class="ico">${ico('i-target')}</span><b>${esc(t('today.focus'))}</b><span>${esc(t('today.focusSub', { m: minutosFoco(hoje()) }))}</span></a>
      <a class="tool" href="#respirar"><span class="ico">${ico('i-wind')}</span><b>${esc(t('today.breathe'))}</b><span>${esc(t('today.breatheSub'))}</span></a>
    </div>
    <a class="ritual" href="#lembretes">
      <div class="ico">${ico('i-bell')}</div>
      <div class="txt"><b>${esc(prox ? prox.r.label : t('today.noReminders'))}</b><span>${esc(prox ? `${t('today.next')} · ${prox.add === 0 ? '' : letraDia(somaDias(hoje(), prox.add)) + ' '}${prox.r.time}` : t('today.addReminder'))}</span></div>
      ${ico('i-arrow')}
    </a>
    <div class="card">
      <div class="bar"><span class="label">${esc(t('today.week'))}</span><span class="small" style="color:var(--teal);font-weight:700">${n ? esc(t('today.streak', { n })) : ''}</span></div>
      <div class="week">${semana}</div>
    </div>
    ${passado ? `<a class="card" href="#entrada-${esc(passado.id)}" style="text-decoration:none;color:inherit"><span class="eyebrow">${esc(t('today.past'))}</span><p class="serif-md">“${esc(passado.body.slice(0, 140))}${passado.body.length > 140 ? '…' : ''}”</p></a>` : ''}
    <div class="tip">${ico('i-bulb')}<p><b>${esc(t('today.science'))}:</b> ${esc(tip)}</p></div>
    ${cartaoInstalar()}`;
  ligarInstalar();
}

/* ---------- Escrever ---------- */
function telaEscrever() {
  let mood = 3, ip = hashN(hoje()) % DATA.journalPrompts.length;
  view.innerHTML = `
    <div class="bar"><a class="icon-btn" href="#hoje" aria-label="${esc(t('common.close'))}">${ico('i-back')}</a><span class="title">${esc(dataCurta(hoje()))}</span><span style="width:44px"></span></div>
    <div><h1>${esc(t('write.title'))}</h1><p class="muted" style="margin-top:6px">${esc(t('write.sub'))}</p></div>
    <div class="card"><span class="label">${esc(t('mood.label'))}</span><div class="moods">
      ${[1, 2, 3, 4, 5].map(v => `<button type="button" data-m="${v}" aria-pressed="${v === 3}"><i style="background:${MOOD_COR[v]}"></i>${esc(t('mood.' + v))}</button>`).join('')}</div>
      <div class="bar" style="margin-top:6px"><label class="label" for="en">${esc(t('energy.label'))}</label><span class="small" style="color:var(--teal);font-weight:700" id="enV">3 / 5</span></div>
      <input type="range" id="en" min="1" max="5" step="1" value="3"><div class="range-legend"><span>${esc(t('energy.low'))}</span><span>${esc(t('energy.high'))}</span></div>
    </div>
    <div class="card aqua field">
      <div class="bar" style="align-items:flex-start;gap:10px"><label for="body" id="prompt" class="serif-md" style="color:var(--ink-teal)">${esc(DATA.journalPrompts[ip])}</label>
        <button type="button" class="icon-btn" id="outra" aria-label="${esc(t('write.otherPrompt'))}" style="flex-shrink:0">${ico('i-shuffle')}</button></div>
      <div class="write"><textarea class="input" id="body" rows="9" placeholder="${esc(t('write.ph'))}" style="min-height:220px"></textarea>
        <button type="button" class="mic" id="mic" aria-pressed="false" aria-label="${esc(t('mic.label'))}">${ico('i-mic')}<span>${esc(t('mic.speak'))}</span></button></div>
      <span class="small muted" id="wc" aria-live="polite">${esc(t('write.words', { n: 0 }))}</span>
    </div>
    <div class="err" id="err"></div>
    <button class="btn" id="save">${esc(t('write.save'))}</button>`;
  const rascunho = LS.get('oasis_draft', null);
  if (rascunho && rascunho.date === hoje()) $('#body').value = rascunho.body;
  const contar = () => { $('#wc').textContent = t('write.words', { n: palavras($('#body').value) }); LS.set('oasis_draft', { date: hoje(), body: $('#body').value }); };
  contar();
  $('#body').addEventListener('input', contar);
  view.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { mood = +b.dataset.m; view.querySelectorAll('[data-m]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $('#en').oninput = () => { $('#enV').textContent = `${$('#en').value} / 5`; };
  $('#outra').onclick = () => { ip = (ip + 1) % DATA.journalPrompts.length; $('#prompt').textContent = DATA.journalPrompts[ip]; };
  ligarMic($('#mic'), $('#body'));
  $('#save').onclick = async () => {
    const body = $('#body').value.trim();
    if (palavras(body) < 2) { $('#err').textContent = t('write.need'); return; }
    $('#save').disabled = true; $('#save').textContent = t('write.saving');
    try {
      const e = await Db.criarEntrada({ mood, energy: +$('#en').value, prompt: DATA.journalPrompts[ip], body });
      LS.del('oasis_draft');
      if (RISCO.test(body)) return telaCrise();
      telaEscrito(e);
    } catch (err) { console.error(err); $('#err').textContent = t('err.generic'); $('#save').disabled = false; $('#save').textContent = t('write.save'); }
  };
}
function telaEscrito(e) {
  const tip = DATA.tips[hashN(e.id) % DATA.tips.length];
  view.innerHTML = `
    <div class="center" style="gap:16px;min-height:auto;padding-top:24px">
      <div class="done-ico">${ico('i-check')}</div>
      <h1>${esc(t('write.doneTitle'))}</h1>
      <p class="muted">${esc(t('write.doneSub', { n: palavras(e.body) }))}</p>
      <div class="tip">${ico('i-bulb')}<p>${esc(tip)}</p></div>
      <span class="eyebrow">${esc(t('write.next'))}</span>
      <a class="btn teal" href="#respirar">${ico('i-wind')}${esc(t('write.toBreathe'))}</a>
      <a class="btn sec" href="#foco">${ico('i-target')}${esc(t('write.toFocus'))}</a>
      <a class="link-btn" href="#hoje" style="align-self:center">${esc(t('write.toToday'))}</a>
    </div>`;
}

/* ---------- Crise ---------- */
function linhaAjuda() {
  const p = pais();
  return `<button class="help-row" id="ajuda" style="border:0;text-align:left;cursor:pointer;width:100%">${ico('i-phone')}
    <span style="flex:1;display:flex;flex-direction:column;gap:2px"><b style="font-size:14px">${esc(t('breathe.help'))}</b><span class="small muted">${esc(t('breathe.helpSub', { country: p.name }))}</span></span>
    <span class="link-btn">${esc(t('breathe.view'))}</span></button>`;
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
    <h1>${esc(t('crisis.title'))}</h1><p>${esc(t('crisis.body'))}</p>
    ${listaLinhas()}
    <a class="btn sec" href="#respirar">${esc(t('nav.breathe'))}</a>
    <a class="link-btn" href="#hoje">${esc(t('crisis.back'))}</a>`;
}
document.addEventListener('click', ev => {
  if (ev.target.closest('#ajuda')) { modal(`<h2>${esc(t('breathe.help'))}</h2>${listaLinhas()}<button class="btn sec" id="fechaAj">${esc(t('common.close'))}</button>`); $('#fechaAj').onclick = fecharModal; }
});

/* ---------- Diário ---------- */
function telaDiario() {
  const dias = Array.from({ length: 7 }, (_, i) => somaDias(hoje(), i - 6));
  const media = (d, k) => { const v = S.entries.filter(e => e.local_date === d && e[k]).map(e => e[k]); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const W = 310, H = 120, step = W / 7;
  const barras = dias.map((d, i) => { const m = media(d, 'mood'); if (!m) return ''; const h = m / 5 * 100; return `<rect x="${Math.round(i * step + (step - 22) / 2)}" y="${Math.round(110 - h)}" width="22" height="${Math.round(h)}" rx="6" fill="${m >= 4 ? '#7C3AED' : '#D9C9F7'}"/>`; }).join('');
  const pts = dias.map((d, i) => { const v = media(d, 'energy'); return v ? `${Math.round(i * step + step / 2)},${Math.round(110 - v / 5 * 100)}` : null; }).filter(Boolean);
  const ult7 = S.entries.filter(e => e.local_date >= dias[0]);
  const total = ult7.reduce((a, e) => a + palavras(e.body), 0);
  const stop = new Set(DATA.stopwords);
  const cont = {};
  ult7.forEach(e => (String(e.body || '').toLowerCase().match(/[\p{L}']{4,}/gu) || []).forEach(w => { w = w.replace(/'s$/, ''); if (!stop.has(w)) cont[w] = (cont[w] || 0) + 1; }));
  const top = Object.entries(cont).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 10);

  view.innerHTML = `
    <div class="bar"><h1>${esc(t('journal.title'))}</h1><a class="btn small" href="#escrever">${ico('i-pen')}${esc(t('journal.new'))}</a></div>
    ${S.entries.length ? `
    <div class="card">
      <div class="bar"><span class="label">${esc(t('journal.last7'))}</span><div class="legend"><span><i style="width:10px;height:10px;border-radius:5px;background:var(--purple);display:block"></i>${esc(t('mood.label'))}</span><span><i style="width:10px;height:3px;background:var(--teal);display:block"></i>${esc(t('energy.label'))}</span></div></div>
      <div class="chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(t('journal.last7'))}">
        <line x1="0" y1="110" x2="${W}" y2="110" stroke="#EDE6DA" stroke-width="1"/>${barras}
        ${pts.length > 1 ? `<polyline points="${pts.join(' ')}" fill="none" stroke="#0E5C52" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}</svg></div>
      <div class="days7">${dias.map(d => `<span>${esc(letraDia(d))}</span>`).join('')}</div>
    </div>
    <div class="stats"><div><b>${ult7.length}</b><span>${esc(t('journal.entries'))}</span></div><div><b>${total}</b><span>${esc(t('journal.words'))}</span></div><div><b>${sequencia()}</b><span>${esc(t('journal.streak'))}</span></div></div>
    ${top.length ? `<div class="card"><span class="label">${esc(t('journal.topWords'))}</span><div class="words">${top.map(([w, n]) => `<span style="font-size:${13 + Math.min(n, 6) * 2}px">${esc(w)}</span>`).join('')}</div></div>` : ''}
    ${S.entries.map(e => `<a class="entry" href="#entrada-${esc(e.id)}" style="text-decoration:none;color:inherit">
      <div class="meta"><span>${esc(dataCurta(e.local_date))} · ${esc(horaTxt(e.created_at))}</span>${e.mood ? `<span>${esc(t('mood.' + e.mood))}</span>` : ''}</div>
      <p style="font-size:15px">${esc((e.body || '').slice(0, 200))}${(e.body || '').length > 200 ? '…' : ''}</p></a>`).join('')}`
    : `<div class="card aqua"><p>${esc(t('journal.empty'))}</p><a class="btn-white" href="#escrever">${esc(t('journal.new'))} ${ico('i-arrow')}</a></div>`}`;
}
function telaEntrada(id) {
  const e = S.entries.find(x => String(x.id) === String(id));
  if (!e) return go('#diario');
  view.innerHTML = `
    <div class="bar"><a class="icon-btn" href="#diario" aria-label="${esc(t('common.close'))}">${ico('i-back')}</a><span class="title">${esc(dataCurta(e.local_date))} · ${esc(horaTxt(e.created_at))}</span><span style="width:44px"></span></div>
    <div>${e.mood ? `<span class="chip">${esc(t('mood.label'))} · ${esc(t('mood.' + e.mood))}</span> ` : ''}${e.energy ? `<span class="chip teal">${esc(t('energy.label'))} · ${e.energy}/5</span>` : ''}</div>
    ${e.prompt ? `<p class="serif-md" style="color:var(--teal)">${esc(e.prompt)}</p>` : ''}
    <div class="card"><p style="white-space:pre-wrap;font-size:16px;line-height:1.6">${esc(e.body)}</p><span class="small muted">${esc(t('write.words', { n: palavras(e.body) }))}</span></div>
    <button class="link-btn" id="del" style="color:#B42318;align-self:flex-start">${esc(t('journal.delete'))}</button>`;
  $('#del').onclick = async () => {
    if (!(await confirmar(t('journal.deleteConfirm')))) return;
    try { await Db.apagarEntrada(e.id); aviso(t('journal.deleted')); go('#diario'); } catch (err) { aviso(t('err.generic')); }
  };
}

/* ---------- Foco ---------- */
let focoTic = null, wakeLock = null;
const FOCO_KEY = 'oasis_focus_run';
async function manterTelaLigada(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { wakeLock = null; }
}
function som() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, .35, .7].forEach((d, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = [523, 659, 784][i]; g.gain.setValueAtTime(.0001, ctx.currentTime + d); g.gain.exponentialRampToValueAtTime(.25, ctx.currentTime + d + .05); g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + d + .9); o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 1); });
  } catch (e) {}
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
}
async function notificarFim(task) {
  try {
    if (document.visibilityState === 'visible' || !('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.ready;
    reg?.showNotification(t('focus.notifTitle'), { body: `${task} · ${t('focus.notifBody')}`, icon: '/assets/icon-192.png', tag: 'oasis-focus', data: { url: '/#foco' } });
  } catch (e) {}
}
function restanteFoco(run) { return run.paused ? run.left : Math.max(0, Math.round((run.endAt - Date.now()) / 1000)); }
async function terminarFoco(completo) {
  const run = LS.get(FOCO_KEY, null); if (!run) return;
  const feito = completo ? run.minutes * 60 : run.minutes * 60 - restanteFoco(run);
  LS.del(FOCO_KEY); clearInterval(focoTic); manterTelaLigada(false);
  if (feito >= 30) await Db.salvarFoco({ task: run.task, planned_minutes: run.minutes, actual_seconds: feito, completed: completo, started_at: run.startedAt, local_date: run.date });
  if (completo) { som(); notificarFim(run.task); }
  telaFocoFim(run, feito, completo);
}
function telaFoco() {
  const run = LS.get(FOCO_KEY, null);
  if (run) return telaFocoAtivo();
  const ultimo = LS.get('oasis_focus_last', { task: '', minutes: 25 });
  let minutes = ultimo.minutes || 25;
  const semana = somaDias(hoje(), -((new Date().getDay() + 6) % 7));
  const recentes = S.focus.slice(0, 5);
  view.innerHTML = `
    <div><h1>${esc(t('focus.title'))}</h1><p class="muted" style="margin-top:6px">${esc(t('focus.sub'))}</p></div>
    <div class="card field">
      <label class="label" for="task">${esc(t('focus.task'))}</label>
      <input class="input" id="task" maxlength="80" placeholder="${esc(t('focus.taskPh'))}" value="${esc(ultimo.task)}">
      <span class="label" style="margin-top:6px">${esc(t('focus.duration'))}</span>
      <div class="chips" id="durs">${[10, 15, 25, 45, 60, 90].map(m => `<button type="button" class="chipbtn" data-min="${m}" aria-pressed="${m === minutes}">${m} ${esc(t('focus.min'))}</button>`).join('')}
        <button type="button" class="chipbtn" data-min="custom" aria-pressed="${![10, 15, 25, 45, 60, 90].includes(minutes)}">${esc(t('focus.custom'))}</button></div>
      <div class="field" id="wrapCustom" ${[10, 15, 25, 45, 60, 90].includes(minutes) ? 'hidden' : ''}><label class="small muted" for="cust">${esc(t('focus.minutes'))}</label><input class="input" id="cust" type="number" inputmode="numeric" min="1" max="240" value="${minutes}"></div>
      <div class="err" id="err"></div>
      <button class="btn" id="start">${ico('i-target')}${esc(t('focus.start'))}</button>
    </div>
    <div class="stats"><div><b>${minutosFoco(hoje())}</b><span>${esc(t('focus.min'))} · ${esc(t('focus.today'))}</span></div><div><b>${minutosFoco(semana)}</b><span>${esc(t('focus.min'))} · ${esc(t('focus.week'))}</span></div><div><b>${S.focus.filter(f => f.local_date >= semana).length}</b><span>${esc(t('focus.sessions'))}</span></div></div>
    ${recentes.length ? `<div class="card"><span class="label">${esc(t('focus.recent'))}</span>${recentes.map(f => `<div class="line"><span>${esc(f.task)}<br><span class="small muted">${esc(dataCurta(f.local_date))}</span></span><b>${Math.round((f.actual_seconds || 0) / 60)} ${esc(t('focus.min'))}</b></div>`).join('')}</div>` : ''}
    <div class="tip">${ico('i-bulb')}<p>${esc(t('focus.tip'))}</p></div>`;
  view.querySelectorAll('[data-min]').forEach(b => b.onclick = () => {
    view.querySelectorAll('[data-min]').forEach(x => x.setAttribute('aria-pressed', x === b));
    const custom = b.dataset.min === 'custom'; $('#wrapCustom').hidden = !custom;
    if (custom) $('#cust').focus(); else minutes = +b.dataset.min;
  });
  $('#start').onclick = () => {
    const task = $('#task').value.trim();
    if (!task) { $('#err').textContent = t('focus.needTask'); $('#task').focus(); return; }
    if (!$('#wrapCustom').hidden) minutes = Math.min(240, Math.max(1, +$('#cust').value || 25));
    LS.set('oasis_focus_last', { task, minutes });
    LS.set(FOCO_KEY, { task, minutes, startedAt: new Date().toISOString(), date: hoje(), endAt: Date.now() + minutes * 60000, paused: false, left: minutes * 60 });
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    telaFocoAtivo();
  };
}
function telaFocoAtivo() {
  const R = 120, C = 2 * Math.PI * R;
  view.innerHTML = `
    <div class="bar"><span class="eyebrow">${esc(t('focus.title'))}</span><span class="small muted" id="fstate"></span></div>
    <div style="text-align:center"><span class="small muted">${esc(t('focus.only'))}</span><h2 id="ftask" style="margin-top:4px"></h2></div>
    <div class="ring-wrap"><svg viewBox="0 0 280 280" class="ring" aria-hidden="true">
      <circle cx="140" cy="140" r="${R}" fill="none" stroke="#EDE6DA" stroke-width="14"/>
      <circle id="arc" cx="140" cy="140" r="${R}" fill="none" stroke="#7C3AED" stroke-width="14" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="0" transform="rotate(-90 140 140)"/></svg>
      <div class="ring-txt"><b id="ftime" aria-live="off"></b><span class="small muted">${esc(t('focus.left'))}</span></div></div>
    <div class="row2"><button class="btn sec" id="pp"></button><button class="btn teal" id="stop">${esc(t('focus.stop'))}</button></div>
    <div class="tip">${ico('i-bulb')}<p>${esc(t('focus.tip'))}</p></div>`;
  const tick = () => {
    const run = LS.get(FOCO_KEY, null);
    if (!run || !document.getElementById('ftime')) { clearInterval(focoTic); return; }
    const left = restanteFoco(run), total = run.minutes * 60;
    $('#ftask').textContent = run.task;
    $('#ftime').textContent = mmss(left);
    $('#arc').setAttribute('stroke-dashoffset', String(C * (1 - left / total)));
    $('#pp').textContent = run.paused ? t('focus.resume') : t('focus.pause');
    $('#fstate').textContent = run.paused ? t('focus.paused') : '';
    document.title = run.paused ? 'Oasis Mind' : `${mmss(left)} · ${run.task}`;
    if (!run.paused && left <= 0) terminarFoco(true);
  };
  $('#pp').onclick = () => {
    const run = LS.get(FOCO_KEY, null); if (!run) return;
    if (run.paused) { run.endAt = Date.now() + run.left * 1000; run.paused = false; manterTelaLigada(true); }
    else { run.left = restanteFoco(run); run.paused = true; manterTelaLigada(false); }
    LS.set(FOCO_KEY, run); tick();
  };
  $('#stop').onclick = async () => { if (await confirmar(t('focus.stopConfirm'))) terminarFoco(false); };
  clearInterval(focoTic); focoTic = setInterval(tick, 1000); tick();
  if (!LS.get(FOCO_KEY, {}).paused) manterTelaLigada(true);
}
function telaFocoFim(run, feito, completo) {
  document.title = 'Oasis Mind — Journal, Focus & Calm';
  view.innerHTML = `<div class="center" style="gap:16px;min-height:auto;padding-top:24px">
    <div class="done-ico">${ico('i-check')}</div>
    <h1>${esc(t('focus.doneTitle'))}</h1>
    <p class="muted">${esc(completo ? t('focus.doneSub', { m: run.minutes, task: run.task }) : t('focus.stoppedSub', { m: Math.round(feito / 60) }))}</p>
    <a class="btn teal" href="#respirar">${ico('i-wind')}${esc(t('focus.break'))}</a>
    <button class="btn sec" id="again">${esc(t('focus.again'))}</button>
    <a class="link-btn" href="#hoje" style="align-self:center">${esc(t('write.toToday'))}</a></div>`;
  $('#again').onclick = () => render();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && LS.get(FOCO_KEY, null) && !LS.get(FOCO_KEY, {}).paused && (location.hash || '') === '#foco') manterTelaLigada(true);
});

/* ---------- Respirar (meditação) ---------- */
let respParar = null;
function telaRespirar() {
  const FASES = [{ k: 'breathe.in', ms: 2000, s: .9, a: 'in' }, { k: 'breathe.in2', ms: 1200, s: 1, a: 'in-again' }, { k: 'breathe.out', ms: 6000, s: .7, a: 'out' }];
  let total = 120, resta = 120, fase = 0, rodando = false, vozOn = !!CFG.audioSOS, prox = 0, tic = null;
  const audio = n => { if (!vozOn) return; try { new Audio(`assets/audio/${n}.mp3`).play().catch(() => {}); } catch (e) {} };
  view.innerHTML = `
    <div class="bar"><span class="eyebrow">${esc(t('nav.breathe'))}</span>
      ${CFG.audioSOS ? `<button class="icon-btn" id="voz" aria-pressed="true" aria-label="${esc(t('breathe.voice'))}">${ico('i-mic')}</button>` : '<span style="width:44px"></span>'}</div>
    <div style="text-align:center;display:flex;flex-direction:column;gap:6px"><h1>${esc(t('breathe.title'))}</h1><p class="muted">${esc(t('breathe.sub'))}</p></div>
    <div class="chips" style="justify-content:center" id="durs">${[1, 2, 5].map(m => `<button type="button" class="chipbtn" data-min="${m}" aria-pressed="${m === 2}">${m} ${esc(t('focus.min'))}</button>`).join('')}</div>
    <div class="orb-wrap"><div class="orb-bg"><div class="orb" id="orb"><div class="mid"><div class="core"></div></div></div></div></div>
    <div style="text-align:center"><div class="phase" id="fase" aria-live="polite"></div><div class="small muted" id="resta" style="font-weight:700"></div></div>
    <div class="row2"><button class="btn" id="pp">${esc(t('breathe.start'))}</button><a class="btn sec" href="#escrever">${esc(t('breathe.write'))}</a></div>
    ${linhaAjuda()}`;
  const mostrar = () => { $('#resta').textContent = t('breathe.left', { t: mmss(resta) }); };
  mostrar();
  const passo = () => {
    if (!document.getElementById('orb')) return parar();
    const f = FASES[fase];
    $('#orb').style.transitionDuration = f.ms + 'ms'; $('#orb').style.transform = `scale(${f.s})`;
    $('#fase').textContent = t(f.k); audio(f.a);
    fase = (fase + 1) % FASES.length; prox = setTimeout(passo, f.ms);
  };
  const parar = () => { clearTimeout(prox); clearInterval(tic); rodando = false; };
  const iniciar = () => {
    rodando = true; $('#pp').textContent = t('breathe.pause'); $('#durs').hidden = true;
    if (resta === total) audio('intro');
    passo();
    tic = setInterval(() => {
      if (!document.getElementById('resta')) return parar();
      resta--; mostrar();
      if (resta <= 0) { parar(); $('#fase').textContent = t('breathe.end'); audio('end'); $('#orb').style.transform = 'scale(.8)'; $('#pp').textContent = t('breathe.start'); resta = total; $('#durs').hidden = false; }
    }, 1000);
  };
  view.querySelectorAll('[data-min]').forEach(b => b.onclick = () => { total = resta = +b.dataset.min * 60; view.querySelectorAll('[data-min]').forEach(x => x.setAttribute('aria-pressed', x === b)); mostrar(); });
  $('#pp').onclick = () => { if (rodando) { parar(); $('#pp').textContent = t('breathe.resume'); } else iniciar(); };
  if ($('#voz')) $('#voz').onclick = () => { vozOn = !vozOn; $('#voz').setAttribute('aria-pressed', vozOn); };
  respParar = parar;
}

/* ---------- Lembretes ---------- */
const PURPOSES = ['journal', 'breathe', 'focus', 'gratitude', 'water', 'move', 'custom'];
const PURPOSE_ICO = { journal: 'i-pen', breathe: 'i-wind', focus: 'i-target', gratitude: 'i-spark', water: 'i-drop', move: 'i-walk', custom: 'i-bell' };
const nomeDias = () => DIAS_TODOS.map(d => new Date(2024, 0, 7 + d).toLocaleDateString(LANG, { weekday: 'short' }));
function descreverDias(days) {
  const s = [...days].sort().join(',');
  if (s === '0,1,2,3,4,5,6') return t('rem.everyday');
  if (s === '1,2,3,4,5') return t('rem.weekdays');
  const n = nomeDias(); return [1, 2, 3, 4, 5, 6, 0].filter(d => days.includes(d)).map(d => n[d]).join(', ');
}
async function estadoPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); return sub && Notification.permission === 'granted' ? 'on' : 'off'; } catch (e) { return 'off'; }
}
async function telaLembretes() {
  view.innerHTML = `
    <div class="bar"><h1>${esc(t('rem.title'))}</h1><button class="btn small" id="novo">${ico('i-plus')}${esc(t('rem.add'))}</button></div>
    <p class="muted">${esc(t('rem.sub'))}</p>
    <div id="pushBox"></div>
    <div id="lista" style="display:flex;flex-direction:column;gap:10px">
      ${S.reminders.length ? S.reminders.map(r => `
        <div class="rem ${r.enabled ? '' : 'off'}">
          <button class="rem-main" data-edit="${esc(r.id)}"><span class="ico">${ico(PURPOSE_ICO[r.purpose] || 'i-bell')}</span>
            <span class="txt"><b>${esc(r.time)}</b><span>${esc(r.label)}</span><span class="small muted">${esc(descreverDias(r.days || []))}</span></span></button>
          <label class="switch"><input type="checkbox" data-tog="${esc(r.id)}" ${r.enabled ? 'checked' : ''}><span class="sr">${esc(t('rem.on'))}</span><i></i></label>
        </div>`).join('') : `<div class="card aqua"><p>${esc(t('rem.empty'))}</p></div>`}
    </div>`;
  $('#novo').onclick = () => editarLembrete(null);
  view.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editarLembrete(S.reminders.find(r => r.id === b.dataset.edit)));
  view.querySelectorAll('[data-tog]').forEach(c => c.onchange = async () => {
    const r = S.reminders.find(x => x.id === c.dataset.tog);
    try { await Db.salvarLembrete({ ...r, enabled: c.checked }); c.closest('.rem').classList.toggle('off', !c.checked); } catch (e) { aviso(t('err.generic')); c.checked = !c.checked; }
  });
  const st = await estadoPush();
  const box = $('#pushBox'); if (!box) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !instalado();
  if (st === 'on') box.innerHTML = `<p class="small" style="color:var(--teal);font-weight:700">${ico('i-check')} ${esc(t('rem.pushOn'))}</p>`;
  else box.innerHTML = `<div class="card ghost"><b>${esc(t('rem.pushTitle'))}</b><p class="small muted">${esc(st === 'denied' ? t('rem.pushDenied') : (ios || st === 'unsupported') ? t('rem.pushIos') : t('rem.pushSub'))}</p>
    ${st === 'off' && !ios ? `<button class="btn small teal" id="pushOn" style="align-self:flex-start">${esc(t('rem.pushBtn'))}</button>` : ''}<p class="small muted" id="pushMsg"></p></div>`;
  if ($('#pushOn')) $('#pushOn').onclick = async () => { const ok = await ativarPush(); if (ok) telaLembretes(); };
}
function editarLembrete(r) {
  const novo = !r;
  const d = r ? { ...r, days: [...(r.days || [])] } : { purpose: 'journal', label: t('purpose.journal'), message: t('purposeMsg.journal'), time: '09:00', days: [...DIAS_TODOS], enabled: true };
  const nomes = nomeDias();
  modal(`<h2>${esc(novo ? t('rem.add') : t('rem.edit'))}</h2>
    <div class="field"><span class="label">${esc(t('rem.purpose'))}</span><div class="chips">
      ${PURPOSES.map(p => `<button type="button" class="chipbtn" data-p="${p}" aria-pressed="${d.purpose === p}">${ico(PURPOSE_ICO[p])}${esc(t('purpose.' + p))}</button>`).join('')}</div></div>
    <div class="field"><label class="label" for="rl">${esc(t('rem.label'))}</label><input class="input" id="rl" maxlength="60" value="${esc(d.label)}"></div>
    <div class="field"><label class="label" for="rm">${esc(t('rem.message'))}</label><input class="input" id="rm" maxlength="120" value="${esc(d.message || '')}"></div>
    <div class="field"><label class="label" for="rt">${esc(t('rem.time'))}</label><input class="input" id="rt" type="time" value="${esc(d.time)}"></div>
    <div class="field"><span class="label">${esc(t('rem.days'))}</span><div class="days">
      ${[1, 2, 3, 4, 5, 6, 0].map(n => `<button type="button" class="day" data-d="${n}" aria-pressed="${d.days.includes(n)}" aria-label="${esc(nomes[n])}">${esc(nomes[n].slice(0, 2))}</button>`).join('')}</div></div>
    <div class="err" id="rerr"></div>
    <button class="btn" id="rsave">${esc(t('rem.save'))}</button>
    <div class="row2">${novo ? '' : `<button class="btn sec" id="rdel" style="color:#B42318">${esc(t('rem.delete'))}</button>`}<button class="btn sec" id="rcan" ${novo ? 'style="grid-column:1 / -1"' : ''}>${esc(t('rem.cancel'))}</button></div>`);
  document.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
    const antigo = d.purpose; d.purpose = b.dataset.p;
    document.querySelectorAll('[data-p]').forEach(x => x.setAttribute('aria-pressed', x === b));
    if (!$('#rl').value.trim() || $('#rl').value === t('purpose.' + antigo)) $('#rl').value = d.purpose === 'custom' ? '' : t('purpose.' + d.purpose);
    if (!$('#rm').value.trim() || $('#rm').value === t('purposeMsg.' + antigo)) $('#rm').value = t('purposeMsg.' + d.purpose);
    if (d.purpose === 'custom') $('#rl').focus();
  });
  document.querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
    const n = +b.dataset.d; d.days = d.days.includes(n) ? d.days.filter(x => x !== n) : [...d.days, n];
    b.setAttribute('aria-pressed', d.days.includes(n));
  });
  $('#rcan').onclick = fecharModal;
  if ($('#rdel')) $('#rdel').onclick = async () => { try { await Db.apagarLembrete(r.id); fecharModal(); aviso(t('rem.deleted')); render(); } catch (e) { $('#rerr').textContent = t('err.generic'); } };
  $('#rsave').onclick = async () => {
    d.label = $('#rl').value.trim(); d.message = $('#rm').value.trim(); d.time = $('#rt').value || '09:00';
    if (!d.label) { $('#rerr').textContent = t('rem.needLabel'); return; }
    if (!d.days.length) { $('#rerr').textContent = t('rem.needDay'); return; }
    $('#rsave').disabled = true;
    try {
      await Db.salvarLembrete({ id: d.id, purpose: d.purpose, label: d.label, message: d.message, time: d.time, days: d.days.sort(), enabled: d.enabled !== false });
      if (S.profile && S.profile.timezone !== Intl.DateTimeFormat().resolvedOptions().timeZone) Db.salvarPerfil({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }).catch(() => {});
      fecharModal(); aviso(t('rem.saved')); render();
    } catch (e) { console.error(e); $('#rerr').textContent = t('err.generic'); $('#rsave').disabled = false; }
  };
}

/* ---------- Ajustes ---------- */
function telaAjustes() {
  const p = S.profile;
  view.innerHTML = `
    <div class="bar"><a class="icon-btn" href="#hoje" aria-label="${esc(t('common.close'))}">${ico('i-back')}</a><span class="title">${esc(t('set.title'))}</span><span style="width:44px"></span></div>
    <div class="card field">
      <span class="label">${esc(t('set.profile'))}</span>
      <label class="small muted" for="nome">${esc(t('ob.name'))}</label><input class="input" id="nome" value="${esc(p.name)}">
      <label class="small muted" for="pais">${esc(t('ob.country'))}</label><select class="input" id="pais">${Object.entries(DATA.countries).map(([k, c]) => `<option value="${k}" ${p.country === k ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <button class="btn small teal" id="salvar" style="align-self:flex-start">${esc(t('set.save'))}</button>
    </div>
    <a class="ritual" href="#lembretes"><div class="ico">${ico('i-bell')}</div><div class="txt"><b>${esc(t('rem.title'))}</b><span>${esc(t('rem.sub'))}</span></div>${ico('i-arrow')}</a>
    <div class="card"><span class="label">${esc(t('set.privacyTitle'))}</span><p class="small">${esc(t('ob.privacyNote'))}</p><p class="small muted">${esc(t('set.disclaimer'))}</p></div>
    <div class="card"><span class="label">${esc(t('set.data'))}</span>
      <button class="link-btn" id="pw" style="justify-content:flex-start">${esc(t('set.password'))}</button>
      <button class="link-btn" id="exp" style="justify-content:flex-start">${esc(t('set.export'))}</button>
      <button class="link-btn" id="del" style="justify-content:flex-start;color:#B42318">${esc(t('set.delete'))}</button></div>
    <div class="card"><span class="label">${esc(t('set.support'))}</span><a href="mailto:${esc(CFG.suporteEmail)}">${esc(CFG.suporteEmail)}</a>
      <button class="link-btn" id="inst" style="justify-content:flex-start">${esc(t('set.install'))}</button></div>
    <button class="btn sec" id="sair">${esc(t('set.signout'))}</button>`;
  $('#salvar').onclick = async () => {
    try { await Db.salvarPerfil({ name: $('#nome').value.trim() || p.name, country: $('#pais').value, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }); aviso(t('set.saved')); }
    catch (e) { aviso(t('err.generic')); }
  };
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
function instrucoesInstalar() {
  if (promptInstalar) { promptInstalar.prompt(); promptInstalar = null; return; }
  modal(`<h2>${esc(t('install.title'))}</h2><p>${esc(t('install.ios'))}</p><p>${esc(t('install.android'))}</p><button class="btn" id="okI">${esc(t('install.ok'))}</button>`);
  $('#okI').onclick = fecharModal;
}
function chaveVapid(b64) { const p = '='.repeat((4 - b64.length % 4) % 4); const r = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); }
async function ativarPush() {
  const msg = $('#pushMsg');
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !CFG.vapidPublicKey) { if (msg) msg.textContent = t('rem.pushIos'); return false; }
    if (await Notification.requestPermission() !== 'granted') { if (msg) msg.textContent = t('rem.pushDenied'); return false; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveVapid(CFG.vapidPublicKey) });
    if (!DEMO) {
      const { error } = await S.sb.from('push_subscriptions').upsert({ endpoint: sub.endpoint, user_id: S.user.id, subscription: sub.toJSON() });
      if (error) throw error;
      Db.salvarPerfil({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }).catch(() => {});
    }
    return true;
  } catch (e) { console.error(e); if (msg) msg.textContent = t('err.generic'); return false; }
}

/* ---------- Roteamento ---------- */
async function render() {
  if (respParar) { respParar(); respParar = null; }
  fecharModal();
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  $('#demoBar').hidden = !(DEMO && S.user); $('#demoBar').textContent = t('demo.bar');
  const tabs = $('#tabs');
  if (!S.user) { tabs.hidden = true; return telaLogin(); }
  if (!S.loaded) {
    view.innerHTML = '<div class="center" style="align-items:center"><span class="typing"><i></i><i></i><i></i></span></div>';
    try { await Db.carregar(); } catch (e) { console.error(e); view.innerHTML = `<div class="center"><p>${esc(t('err.generic'))}</p></div>`; return; }
  }
  if (!S.access) { tabs.hidden = true; return telaSemAcesso(); }
  if (!S.profile?.onboarded_at) { tabs.hidden = true; return telaOnboarding(); }
  const h = (location.hash || '#hoje').slice(1);
  const rota = h.split('-')[0];
  tabs.hidden = ['escrever', 'entrada', 'ajustes'].includes(rota);
  tabs.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.tab === rota || (rota === 'entrada' && a.dataset.tab === 'diario')));
  if (rota !== 'foco') document.title = 'Oasis Mind — Journal, Focus & Calm';
  if (rota === 'escrever') telaEscrever();
  else if (rota === 'diario') telaDiario();
  else if (rota === 'entrada') telaEntrada(h.slice('entrada-'.length));
  else if (rota === 'foco') telaFoco();
  else if (rota === 'respirar') telaRespirar();
  else if (rota === 'lembretes') telaLembretes();
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
