-- FOCUS | Banco de dados inicial
-- Execute este arquivo no Supabase > SQL Editor.
-- As políticas RLS garantem que cada usuário acesse somente seus próprios dados.

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null,
  description text,
  due_date date,
  priority text not null default 'Normal'
    check (priority in ('Baixa', 'Normal', 'Alta')),
  status text not null default 'Pendente'
    check (status in ('Pendente', 'Em andamento', 'Concluída')),
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.subjects enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;

drop policy if exists "Usuário gerencia suas matérias" on public.subjects;
create policy "Usuário gerencia suas matérias"
on public.subjects for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Usuário gerencia suas atividades" on public.tasks;
create policy "Usuário gerencia suas atividades"
on public.tasks for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Usuário gerencia suas anotações" on public.notes;
create policy "Usuário gerencia suas anotações"
on public.notes for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists subjects_user_id_idx on public.subjects(user_id);
create index if not exists tasks_user_id_idx on public.tasks(user_id);
create index if not exists tasks_due_date_idx on public.tasks(due_date);
create index if not exists notes_user_id_idx on public.notes(user_id);


-- Eventos do calendário acadêmico
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  event_date date not null,
  event_type text not null default 'Outro'
    check (event_type in ('Aula', 'Prova', 'Trabalho', 'Compromisso', 'Outro')),
  created_at timestamptz not null default now()
);

-- Histórico de sessões Pomodoro concluídas
create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'Foco',
  duration_minutes integer not null check (duration_minutes > 0 and duration_minutes <= 180),
  completed_at timestamptz not null default now()
);

-- Avaliações e notas
create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null,
  category text not null default 'Geral',
  grade numeric(5,2) not null check (grade >= 0 and grade <= 100),
  weight numeric(5,2) not null default 15 check (weight > 0 and weight <= 100),
  created_at timestamptz not null default now()
);

-- Migração segura da versão anterior (escala de 0 a 10) para 0 a 100.
-- A conversão só acontece quando a restrição antiga de máximo 10 ainda existe.
do $$
declare old_constraint record;
begin
  for old_constraint in
    select conname, pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid = 'public.grades'::regclass and contype = 'c'
  loop
    if old_constraint.definition ilike '%grade%<=%10%' then
      update public.grades set grade = grade * 10;
      execute format('alter table public.grades drop constraint %I', old_constraint.conname);
    end if;
  end loop;
end $$;

alter table public.grades alter column grade type numeric(5,2);
alter table public.grades add column if not exists weight numeric(5,2) not null default 15;
alter table public.grades add column if not exists category text not null default 'Geral';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.grades'::regclass and conname = 'grades_grade_0_100_check'
  ) then
    alter table public.grades add constraint grades_grade_0_100_check check (grade >= 0 and grade <= 100);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.grades'::regclass and conname = 'grades_weight_0_100_check'
  ) then
    alter table public.grades add constraint grades_weight_0_100_check check (weight > 0 and weight <= 100);
  end if;
end $$;

alter table public.events enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.grades enable row level security;

drop policy if exists "Usuário gerencia seus eventos" on public.events;
create policy "Usuário gerencia seus eventos"
on public.events for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Usuário gerencia suas sessões" on public.focus_sessions;
create policy "Usuário gerencia suas sessões"
on public.focus_sessions for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Usuário gerencia suas notas" on public.grades;
create policy "Usuário gerencia suas notas"
on public.grades for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists events_user_date_idx on public.events(user_id, event_date);
create index if not exists focus_sessions_user_date_idx on public.focus_sessions(user_id, completed_at);
create index if not exists grades_user_subject_idx on public.grades(user_id, subject_id);


-- v3: tipo Simulado, lembretes e regra de cálculo da faculdade por matéria
alter table public.events add column if not exists remind_days_before integer not null default 1
  check (remind_days_before between 0 and 30);
alter table public.events drop constraint if exists events_event_type_check;
alter table public.events add constraint events_event_type_check
  check (event_type in ('Aula', 'Prova', 'Simulado', 'Trabalho', 'Compromisso', 'Outro'));
alter table public.subjects add column if not exists grading_notes text;
