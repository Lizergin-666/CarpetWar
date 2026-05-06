create table if not exists public.player_stats (
  player_key text primary key,
  name text not null,
  city text not null,
  games integer not null default 0 check (games >= 0),
  wins integer not null default 0 check (wins >= 0),
  draws integer not null default 0 check (draws >= 0),
  losses integer not null default 0 check (losses >= 0),
  shots integer not null default 0 check (shots >= 0),
  hits integer not null default 0 check (hits >= 0 and hits <= shots),
  updated_at_ms bigint not null
);

create index if not exists player_stats_city_idx
  on public.player_stats (city);

create index if not exists player_stats_score_idx
  on public.player_stats (wins desc, draws desc, losses asc, hits desc);
