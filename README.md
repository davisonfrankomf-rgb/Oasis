# Oasis Mind — diário de 5 minutos com IA

Web app instalável (PWA) para iPhone, Android e desktop. App em **oasismind.app**; página de vendas em **oasismind.com** (a fazer).
Mesma estrutura do Inabaláveis: HTML/CSS/JS sem build + funções da Vercel em `/api` + Supabase.

O app já funciona em **modo demonstração**: deixe `supabaseUrl` vazio em `config.js`. Nesse modo tudo fica salvo só no aparelho e as respostas da IA são simuladas (código de login: `123456`).

## O que já está no app (MVP)

- Login com o e-mail da compra e código de 6 dígitos. O acesso só abre se o webhook registou a compra.
- Onboarding: nome, objetivo, horários de manhã e noite, país (para as linhas de apoio) e consentimentos RGPD.
- Check-in da manhã (humor, energia, intenção, pergunta guiada) e reflexão da noite (correu bem, pesou, gratidão, pergunta da IA ligada à manhã).
- Voz para texto com o ditado do navegador (Chrome, Edge, Safari). Onde não existe, o botão do microfone não aparece.
- Resposta da IA a cada entrada, com até 3 respostas seguidas, dica científica e aviso "não substitui terapia".
- Memória: a IA guarda um resumo da pessoa e até 3 temas para retomar ("Oasis remembers").
- Insights: gráfico de humor e energia dos últimos 7 dias, sequência e resumo semanal automático (segundas-feiras).
- SOS: respiração guiada de 2 minutos (duas inspirações curtas, expiração longa), conversa com a IA e linhas de apoio do país.
- Segurança: palavras de risco bloqueiam o coaching e mostram ajuda humana; a IA também classifica o risco em cada mensagem.
- RGPD: exportar todos os dados (JSON) e apagar a conta em Settings.
- Lembretes por push no horário de cada pessoa, funcionamento offline e estrutura de idiomas (`i18n.js`).

## Passo a passo

### 1. Supabase

1. Crie um projeto em supabase.com **na região da UE** (Frankfurt).
2. **SQL Editor**: cole `supabase/schema.sql` e clique em **Run**.
3. **Authentication > Email Templates > Magic Link**: use o código no corpo do e-mail, por exemplo
   `Your Oasis Mind code is: {{ .Token }}`
   (código em vez de link, porque no iPhone o link abre no Safari e não no app instalado).
4. **Authentication > URL Configuration**: Site URL `https://oasismind.app`.
5. Configure um SMTP próprio (Resend ou Brevo) em **Project Settings > Auth > SMTP**. O e-mail padrão do Supabase tem limite baixo.
6. Copie a **Project URL** e a **anon key** para `config.js`. A **service_role key** vai só para a Vercel.

### 2. Chave da IA (Anthropic)

Crie uma chave em console.anthropic.com, defina um limite de gasto mensal e aceite o DPA (acordo de tratamento de dados).
Modelos usados: `claude-haiku-5-5` nas respostas e `claude-sonnet-5-5` no resumo semanal (podem ser trocados por variável).

### 3. Notificações push

No terminal: `npx web-push generate-vapid-keys`. A pública vai para `vapidPublicKey` no `config.js`; as duas vão para a Vercel.

### 4. Vercel

1. **Add New → Project**, importe o repositório `Oasis`, Framework **Other**, sem build. Em Settings, região das funções: **Frankfurt (fra1)**.
2. **Environment Variables**:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `WEBHOOK_SECRET` e `CRON_SECRET` (senhas longas inventadas)
   - `PRODUCT_MAP`, ex.: `{"ID_MENSAL":"monthly","ID_ANUAL":"annual","ID_BLACK_FRIDAY":"annual"}`
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:hello@oasismind.app`)
   - Opcionais: `SITE_URL`, `AI_MODEL`, `AI_WEEKLY_MODEL`, `AI_DAILY_LIMIT` (padrão 40)
3. **Settings → Domains**: `oasismind.app` e `www.oasismind.app`.
4. Crons em `vercel.json`: lembretes de hora a hora (**precisa do plano Pro**; no plano grátis mude para uma vez por dia) e resumo semanal às segundas às 06:00 UTC.

### 5. Webhook do checkout

Cadastre `https://oasismind.app/api/webhook?token=SEU_WEBHOOK_SECRET` para compra aprovada, renovação, cancelamento, reembolso e chargeback.
Faça uma compra de teste e confira a linha `webhook {...}` em **Vercel → Logs** para acertar os IDs do `PRODUCT_MAP`.

### 6. Antes de lançar

- Confirmar todos os números de apoio em `data.js` (fonte: findahelpline.com).
- Política de privacidade, termos e página de vendas em oasismind.com.
- Testar 30 frases de risco e 20 entradas normais com a IA real.
- Subir os áudios do SOS em `assets/audio/` (`intro.mp3`, `in.mp3`, `in-again.mp3`, `out.mp3`, `end.mp3`) e ligar `audioSOS: true` no `config.js`.

## Ficheiros

| Ficheiro | Para quê |
|---|---|
| `index.html`, `styles.css`, `app.js` | O app |
| `i18n.js` | Textos em inglês e estrutura para DE, FR, ES, PT |
| `data.js` | Perguntas guiadas, dicas científicas e linhas de apoio por país |
| `config.js` | Chaves públicas e links |
| `sw.js`, `manifest.webmanifest`, `assets/` | Instalação, offline, ícones e logo |
| `api/ai.js` | Resposta da IA, memória, risco e limite diário |
| `api/weekly-summary.js` | Resumo semanal (cron) |
| `api/reminders.js` | Lembretes por push (cron) |
| `api/webhook.js` | Libera ou revoga o acesso a partir das vendas |
| `api/delete-account.js` | Apaga a conta e os dados (RGPD) |
| `supabase/schema.sql` | Tabelas e regras de segurança |

## Próximos passos (V1.1 / V2)

- Lembretes por e-mail (para quem não instala o app).
- Transcrição de voz no servidor (mais estável que o ditado do navegador).
- Jornadas temáticas de 7 dias, idiomas DE e FR, página de vendas.
