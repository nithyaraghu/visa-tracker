-- Run this in Supabase SQL Editor
-- supabase.com → your project → SQL Editor → New query → paste → Run

create table if not exists public.user_visa_data (
  id                  uuid default gen_random_uuid() primary key,
  user_id             uuid references auth.users(id) on delete cascade not null unique,
  visa_type           text,
  auth_start          date,
  auth_end            date,
  employment_periods  jsonb default '[]',
  opt_auth_start      date,
  opt_auth_end        date,
  opt_periods         jsonb default '[]',
  cpt_program_start   date,
  cpt_program_end     date,
  enrolled_months     integer default 0,
  onboarded           boolean default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Enable Row Level Security
alter table public.user_visa_data enable row level security;

-- Users can only read/write their own data
create policy "Users can read own data"
  on public.user_visa_data for select
  using (auth.uid() = user_id);

create policy "Users can insert own data"
  on public.user_visa_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update own data"
  on public.user_visa_data for update
  using (auth.uid() = user_id);