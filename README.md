# Oasis Mind — diário, foco e respiração

Web app instalável (PWA) para iPhone, Android e desktop. App em **oasismind.app**; página de vendas em **oasismind.com** (a fazer).
Mesma estrutura do Inabaláveis: HTML/CSS/JS sem build + funções da Vercel em `/api` + Supabase.

O app já funciona em **modo demonstração**: deixe `supabaseUrl` vazio em `config.js`. Nesse modo tudo fica salvo só no aparelho (código de login: `123456`).

## O que está no app

Sem IA: custo de operação praticamente zero (só Supabase e Vercel, ambos no plano grátis).

- Login com o e-mail da compra (link ou código por e-mail) ou com senha. O acesso só abre se o webhook registou a compra.
- Onboarding: nome, objetivo, horários de manhã e noite (criam 2 lembretes), país (linhas de apoio) e consentimento RGPD.
- Diário livre ("Empty your head"): humor, energia, pergunta guiada que pode ser trocada, escrita livre ou por voz (ditado do navegador), rascunho salvo automaticamente e contador de palavras.
- Diário: histórico, gráfico de humor e energia dos últimos 7 dias, palavras escritas, sequência de dias e "What's been on your mind" (palavras mais repetidas).
- Lembretes: a pessoa cria quantos quiser, com propósito (escrever, respirar, foco, gratidão, água, mexer-se, outro), texto, horário e dias da semana. Chegam por notificação push.
- Foco: cronómetro para uma única atividade (10 a 90 min ou personalizado), pausa, fim antecipado, som e vibração no fim, tela sempre ligada e histórico de sessões.
- Respirar: respiração guiada de 1, 2 ou 5 minutos (duas inspirações curtas, expiração longa) e linhas de apoio do país.
- Segurança: palavras de risco no diário mostram linhas de apoio humanas.
- RGPD: exportar todos os dados (JSON) e apagar a conta em Settings.
- Funciona offline e tem estrutura de idiomas (`i18n.js`).

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

### 3. Notificações push

No terminal: `npx web-push generate-vapid-keys`. A pública vai para `vapidPublicKey` no `config.js`; as duas vão para a Vercel.

### 4. Vercel

1. **Add New → Project**, importe o repositório `Oasis`, Framework **Other**, sem build. Em Settings, região das funções: **Frankfurt (fra1)**.
2. **Environment Variables**:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `WEBHOOK_SECRET` e `CRON_SECRET` (senhas longas inventadas)
   - `PRODUCT_MAP`, ex.: `{"ID_MENSAL":"monthly","ID_ANUAL":"annual","ID_BLACK_FRIDAY":"annual"}`
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:hello@oasismind.app`)
   - Opcional: `SITE_URL`
3. **Settings → Domains**: `oasismind.app` e `www.oasismind.app`.
4. Os lembretes são disparados a cada 5 minutos pelo agendador do próprio Supabase (pg_cron), no fim de `supabase/schema.sql`. Troque `SEU_CRON_SECRET` pelo valor de `CRON_SECRET`.

### 5. Webhook do checkout

Cadastre `https://oasismind.app/api/webhook?token=SEU_WEBHOOK_SECRET` para compra aprovada, renovação, cancelamento, reembolso e chargeback.
Faça uma compra de teste e confira a linha `webhook {...}` em **Vercel → Logs** para acertar os IDs do `PRODUCT_MAP`.

### 6. Antes de lançar

- Confirmar todos os números de apoio em `data.js` (fonte: findahelpline.com).
- Política de privacidade, termos e página de vendas em oasismind.com.
- Subir os áudios do SOS em `assets/audio/` (`intro.mp3`, `in.mp3`, `in-again.mp3`, `out.mp3`, `end.mp3`) e ligar `audioSOS: true` no `config.js`.

## Ficheiros

| Ficheiro | Para quê |
|---|---|
| `index.html`, `styles.css`, `app.js` | O app |
| `i18n.js` | Textos em inglês e estrutura para DE, FR, ES, PT |
| `data.js` | Perguntas do diário, base científica e linhas de apoio por país |
| `config.js` | Chaves públicas e links |
| `sw.js`, `manifest.webmanifest`, `assets/` | Instalação, offline, ícones e logo |
| `api/reminders.js` | Envia os lembretes por push (chamado a cada 5 min pelo Supabase) |
| `api/webhook.js` | Libera ou revoga o acesso a partir das vendas |
| `api/delete-account.js` | Apaga a conta e os dados (RGPD) |
| `supabase/schema.sql` | Tabelas e regras de segurança |

## Próximos passos

- Lembretes também por e-mail (para quem não instala o app).
- Áudios guiados na respiração.
- Idiomas DE e FR e página de vendas.
