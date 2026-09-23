-- ═════════════════════════════════════════════════════════════════════════════
-- AUTHORITY LOGIN & ACTIVITY LOGS — Supabase Audit Table
-- Where: Supabase Dashboard → SQL Editor → New query → paste this file → Run
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.authority_logs (
    id            uuid primary key default gen_random_uuid(),
    code          text not null,
    user_id       text not null,
    email         text,
    full_name     text,
    action        text not null default 'login', -- 'login', 'code_redeem', 'advisory_publish', etc.
    ip_address    text,
    user_agent    text,
    created_at    timestamptz not null default now()
);

comment on table public.authority_logs is
  'Audit log of authority console code logins and official actions. Written by the backend service-role key.';

-- Performance indexes for lookup by code and reverse-chronological audits
create index if not exists authority_logs_created_at_idx
    on public.authority_logs (created_at desc);

create index if not exists authority_logs_code_idx
    on public.authority_logs (code);

-- Security: Enable RLS and revoke browser grants (only service_role key can read/write)
alter table public.authority_logs enable row level security;
revoke all on public.authority_logs from anon;
revoke all on public.authority_logs from authenticated;
