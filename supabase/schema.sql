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
  consent_ai_at timestamptz,
  consent_sensitive_at timestamptz,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "perfil proprio" on public.profiles;
create policy "perfil proprio" on public.profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Entradas do diário (manhã, noite, nota livre, SOS) e respostas da IA
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('morning','evening','free','sos')),
  local_date date not null,
  mood int check (mood between 1 and 5),
  energy int check (energy between 1 and 5),
  prompt text,
  intention text,
  went_well text,
  weighed text,
  gratitude text,
  body text,
  ai_reply text,
  followups jsonb not null default '[]'::jsonb,
  evening_question text,
  risk text check (risk in ('none','medium','high')),
  created_at timestamptz not null default now()
);
create index if not exists entries_user_date_idx on public.entries (user_id, local_date desc);
alter table public.entries enable row level security;
drop policy if exists "entradas proprias" on public.entries;
create policy "entradas proprias" on public.entries
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Memória da IA: resumo da pessoa e temas a retomar (escrita só pelo servidor)
create table if not exists public.memory (
  user_id uuid primary key references auth.users(id) on delete cascade,
  summary text not null default '',
  open_threads jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.memory enable row level security;
drop policy if exists "ver a propria memoria" on public.memory;
create policy "ver a propria memoria" on public.memory
  for select using (user_id = auth.uid());

-- Resumos semanais (escritos pelo cron)
create table if not exists public.weekly_reports (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  report jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);
alter table public.weekly_reports enable row level security;
drop policy if exists "ver os proprios resumos" on public.weekly_reports;
create policy "ver os proprios resumos" on public.weekly_reports
  for select using (user_id = auth.uid());

-- Eventos de risco (sem o texto da entrada). Só o servidor lê e escreve.
create table if not exists public.risk_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid references public.entries(id) on delete set null,
  level text not null check (level in ('medium','high')),
  created_at timestamptz not null default now()
);
alter table public.risk_events enable row level security;

-- Uso da IA por dia (limite diário e controlo de custos). Só o servidor.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  calls int not null default 0,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;

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
grant select, insert, update, delete on public.profiles, public.entries, public.push_subscriptions to authenticated;
grant select on public.memory, public.weekly_reports to authenticated;
grant all on public.purchases, public.profiles, public.entries, public.memory, public.weekly_reports,
  public.risk_events, public.ai_usage, public.push_subscriptions to service_role;
grant usage, select on sequence public.purchases_id_seq, public.weekly_reports_id_seq, public.risk_events_id_seq to service_role;

-- Custo médio da IA por pessoa (consulta útil no SQL Editor)
-- select user_id, sum(calls) chamadas, sum(input_tokens) entrada, sum(output_tokens) saida
-- from public.ai_usage where day >= current_date - 30 group by 1 order by 2 desc;
