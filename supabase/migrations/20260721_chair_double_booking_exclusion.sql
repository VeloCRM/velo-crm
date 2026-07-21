-- Velo: DB-level chair double-booking guard (ALREADY APPLIED to velo-staging
-- 2026-07-21 as "chair_double_booking_exclusion"). Kept so repo migration
-- history matches the database. Do not re-run against staging.
create extension if not exists btree_gist;

create or replace function public.appointment_block(ts timestamptz, mins integer)
returns tstzrange
language sql immutable parallel safe
as $$ select tstzrange(ts, ts + (mins + 15) * interval '1 minute') $$;

alter table public.appointments
  add constraint no_chair_double_booking
  exclude using gist (
    org_id with =,
    chair_id with =,
    public.appointment_block(scheduled_at, duration_minutes) with &&
  )
  where (status not in ('cancelled', 'no_show'));
