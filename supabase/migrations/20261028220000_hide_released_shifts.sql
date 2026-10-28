-- Update 6: a worker released from a shift no longer sees that shift on the board.
-- A worker blocked by a business sees none of that business's shifts until unblocked.
-- Safe to run again.

drop function if exists public.open_shifts(double precision, double precision, int, int);
create or replace function public.open_shifts(p_lat double precision default null, p_lon double precision default null,
                                              p_radius_km int default 200, p_limit int default 200)
returns table (id uuid, title text, description text, category text, city text, province text, lat double precision, lon double precision,
               starts_at timestamptz, ends_at timestamptz, hourly_rate_zar numeric, workers_needed int, booked int, payment_method text,
               business_id uuid, business_name text, business_verified boolean, business_avatar text, business_theme text, distance_km double precision)
language sql stable security definer set search_path = public as $$
  select * from (
    select s.id as id, s.title as title, s.description as description, s.category as category, s.city as city, s.province as province,
           round(s.lat::numeric, 2)::float8 as lat, round(s.lon::numeric, 2)::float8 as lon,
           s.starts_at as starts_at, s.ends_at as ends_at, s.hourly_rate_zar as hourly_rate_zar, s.workers_needed as workers_needed,
           (select count(*)::int from applications a where a.shift_id = s.id and a.status in ('accepted', 'completed')) as booked,
           s.payment_method as payment_method, p.id as business_id, coalesce(p.business_name, 'Local business') as business_name,
           p.verified as business_verified, p.business_avatar_url as business_avatar, p.theme as business_theme,
           case when p_lat is null or p_lon is null then null
                else 6371 * 2 * asin(sqrt(power(sin(radians(s.lat - p_lat) / 2), 2) + cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lon - p_lon) / 2), 2))) end as distance_km
    from shifts s join profiles p on p.id = s.business_id
    where s.status = 'open' and s.starts_at > now() and not p.suspended
      and (auth.uid() is null or (
            not exists (select 1 from business_blocks b where b.business_id = s.business_id and b.worker_id = auth.uid())
        and not exists (select 1 from applications r where r.shift_id = s.id and r.worker_id = auth.uid() and r.status = 'declined')))
  ) x
  where x.distance_km is null or x.distance_km <= least(greatest(p_radius_km, 1), 2000)
  order by x.distance_km nulls last, x.starts_at
  limit least(greatest(p_limit, 1), 500);
$$;
grant execute on function public.open_shifts(double precision, double precision, int, int) to anon, authenticated;
