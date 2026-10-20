-- Source only. Apply together with the reviewed endpoint deployment.
create table if not exists public.capture_arrangement_quota (
 account uuid not null references auth.users(id) on delete cascade,
 day date not null,
 count integer not null default 0,
 primary key (account,day)
);
alter table public.capture_arrangement_quota enable row level security;
revoke all on public.capture_arrangement_quota from anon,authenticated;
create or replace function public.consume_capture_arrangement(account uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare used integer;
begin
 insert into capture_arrangement_quota(account,day,count) values($1,(now() at time zone 'utc')::date,1)
 on conflict on constraint capture_arrangement_quota_pkey do update set count=capture_arrangement_quota.count+1
 where capture_arrangement_quota.count<100
 returning count into used;
 return used is not null;
end $$;
revoke all on function public.consume_capture_arrangement(uuid) from public,anon,authenticated;
grant execute on function public.consume_capture_arrangement(uuid) to service_role;
