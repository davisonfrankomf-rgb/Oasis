-- Oasis Mind — banco de dados (cole no Supabase > SQL Editor e execute)
-- Crie o projeto na região da UE (ex.: Frankfurt, eu-central-1).

-- Compras: preenchida pelo webhook do checkout
create table if not exists public.purchases (
  id bigserial primary key,
  email text not null,
  product text not null default 'oasis',
  plan text,
  status text not null default 'active' check (status in ('active','revoked')),
  provider text,
  order_id text,
  updated_at timestamptz not null default now(),
  unique (email, product)
);
create index if not exists purchases_email_idx on public.purchases (lower(email));
alter table public.purchases enable row level security;
drop policy if exists "ver as proprias compras" on public.purchases;
create policy "ver as proprias compras" on public.purchases
  for select using (lower(email) = lower(auth.jwt() ->> 'email'));

-- Perfil e consentimentos (RGPD)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  goal text,
  country text,
  locale text not null default 'en',
  timezone text,
  morning_time text default '08:00',
  evening_time text default '21:00',
  consent_sensitive_at timestamptz,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "perfil proprio" on public.profiles;
create policy "perfil proprio" on public.profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Entradas do diário
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'journal',
  local_date date not null,
  mood int check (mood between 1 and 5),
  energy int check (energy between 1 and 5),
  prompt text,
  body text,
  created_at timestamptz not null default now()
);
create index if not exists entries_user_date_idx on public.entries (user_id, local_date desc);
alter table public.entries enable row level security;
drop policy if exists "entradas proprias" on public.entries;
create policy "entradas proprias" on public.entries
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Lembretes personalizados (enviados por push pelo /api/reminders)
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null default 'custom',
  label text not null,
  message text,
  time text not null,
  days int[] not null default '{0,1,2,3,4,5,6}',
  enabled boolean not null default true,
  last_sent_on date,
  created_at timestamptz not null default now()
);
create index if not exists reminders_enabled_idx on public.reminders (enabled);
alter table public.reminders enable row level security;
drop policy if exists "lembretes proprios" on public.reminders;
create policy "lembretes proprios" on public.reminders
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Sessões de foco
create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task text not null,
  planned_minutes int not null,
  actual_seconds int not null default 0,
  completed boolean not null default false,
  started_at timestamptz not null default now(),
  local_date date not null
);
create index if not exists focus_user_date_idx on public.focus_sessions (user_id, local_date desc);
alter table public.focus_sessions enable row level security;
drop policy if exists "foco proprio" on public.focus_sessions;
create policy "foco proprio" on public.focus_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Inscrições de notificação push
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push proprio" on public.push_subscriptions;
create policy "push proprio" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Permissões da API
grant select on public.purchases to authenticated;
grant select, insert, update, delete on public.profiles, public.entries, public.reminders, public.focus_sessions, public.push_subscriptions to authenticated;
grant all on public.purchases, public.profiles, public.entries, public.reminders, public.focus_sessions, public.push_subscriptions to service_role;
grant usage, select on sequence public.purchases_id_seq to service_role;

-- Agendador gratuito: chama /api/reminders a cada 5 minutos.
-- Troque SEU_CRON_SECRET pelo mesmo valor da variável CRON_SECRET da Vercel.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('oasis-reminders') where exists (select 1 from cron.job where jobname = 'oasis-reminders');
select cron.schedule('oasis-reminders', '*/5 * * * *', $$
  select net.http_get(
    url := 'https://oasismind.vercel.app/api/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer SEU_CRON_SECRET'),
    timeout_milliseconds := 20000
  );
$$);
