-- Secret Number: schema + server-side game logic.
-- Hidden numbers, clue results and guesses are never readable by clients directly;
-- every action goes through SECURITY DEFINER functions authenticated by a per-player token.

create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────── tables ─────────────────────────
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_player uuid,
  mode text not null check (mode in ('full','casual')),
  max_players int not null,
  invest_minutes int not null,
  status text not null default 'lobby'
    check (status in ('lobby','briefing','investigation','guessing','reveal')),
  phase_ends_at timestamptz,
  round int not null default 1,
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  seat int not null,
  tickets jsonb not null default '{}'::jsonb,
  ready boolean not null default false,
  guessed boolean not null default false,
  score int not null default 0,
  own_points int not null default 0,
  guess_points int not null default 0,
  secret_bonus int not null default 0,
  revealed_number int,            -- filled only at reveal
  created_at timestamptz not null default now(),
  unique (room_id, seat)
);
create index on public.players(room_id);

create table public.player_keys (
  player_id uuid primary key references public.players(id) on delete cascade,
  token text not null
);

create table public.secrets (
  player_id uuid primary key references public.players(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  number int not null,
  unique (room_id, number)
);

-- public visit log (who visited whom with which ticket) – result is NOT here
create table public.visits (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  from_player uuid not null references public.players(id) on delete cascade,
  to_player uuid not null references public.players(id) on delete cascade,
  ticket text not null,
  created_at timestamptz not null default now()
);
create index on public.visits(room_id);

-- private: result of each visit, only for the two players involved
create table public.clues (
  visit_id bigint primary key references public.visits(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  from_player uuid not null,
  to_player uuid not null,
  ticket text not null,
  result text not null,
  created_at timestamptz not null default now()
);

create table public.guesses (
  player_id uuid not null references public.players(id) on delete cascade,
  target_player uuid not null references public.players(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  value int not null,
  primary key (player_id, target_player)
);

-- ───────────────────────── RLS ─────────────────────────
alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.player_keys enable row level security;
alter table public.secrets enable row level security;
alter table public.visits enable row level security;
alter table public.clues enable row level security;
alter table public.guesses enable row level security;

-- readable public state (no writes from clients at all)
create policy "rooms readable" on public.rooms for select to anon, authenticated using (true);
create policy "players readable" on public.players for select to anon, authenticated using (true);
create policy "visits readable" on public.visits for select to anon, authenticated using (true);
-- player_keys, secrets, clues, guesses: no policies => no client access

revoke all on public.player_keys, public.secrets, public.clues, public.guesses from anon, authenticated;

alter publication supabase_realtime add table public.rooms, public.players, public.visits;

-- ───────────────────────── helpers ─────────────────────────
create or replace function public._auth(p_player uuid, p_token text)
returns public.players language plpgsql security definer set search_path = public as $$
declare pl public.players;
begin
  select p.* into pl from players p join player_keys k on k.player_id = p.id
   where p.id = p_player and k.token = p_token;
  if not found then raise exception 'Not authorised'; end if;
  return pl;
end $$;

create or replace function public._starting_tickets(p_mode text)
returns jsonb language sql immutable as $$
  select case when p_mode = 'full'
    then '{"add":3,"mul":2,"div":2,"zero":1}'::jsonb
    else '{"add":4}'::jsonb end
$$;

create or replace function public._clue(p_mode text, p_ticket text, a int, b int)
returns text language plpgsql immutable as $$
declare s int;
begin
  if p_ticket = 'add' then
    s := a + b;
    if p_mode = 'full' and s <= 20 then return '3–20'; end if;
    if p_mode = 'full' and s >= 180 then return '180–199'; end if;
    return s::text;
  elsif p_ticket = 'mul' then
    return (a * b)::text;
  elsif p_ticket = 'div' then
    return (greatest(a,b) / least(a,b))::text;
  elsif p_ticket = 'zero' then
    return (length(a::text || b::text) - length(replace(a::text || b::text, '0', '')))::text;
  end if;
  raise exception 'Unknown ticket';
end $$;

create or replace function public._join_payload(p_room public.rooms, p_player uuid, p_token text)
returns json language sql stable as $$
  select json_build_object('room_id', p_room.id, 'code', p_room.code,
                           'player_id', p_player, 'token', p_token)
$$;

-- ───────────────────────── lobby ─────────────────────────
create or replace function public.create_room(p_name text, p_mode text, p_max int, p_minutes int)
returns json language plpgsql security definer set search_path = public as $$
declare r public.rooms; pid uuid; tok text; c text; tries int := 0;
begin
  if coalesce(trim(p_name),'') = '' then raise exception 'Name required'; end if;
  if p_mode not in ('full','casual') then raise exception 'Bad mode'; end if;
  if p_mode = 'full' and (p_max < 4 or p_max > 12) then raise exception 'Full mode needs 4–12 players'; end if;
  if p_mode = 'casual' and (p_max < 3 or p_max > 8) then raise exception 'Casual mode needs 3–8 players'; end if;
  if p_minutes < 1 or p_minutes > 60 then raise exception 'Timer must be 1–60 minutes'; end if;
  loop
    select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random()*31)::int, 1), '') into c
      from generate_series(1,4);
    exit when not exists (select 1 from rooms where code = c);
    tries := tries + 1; if tries > 20 then raise exception 'Could not allocate code'; end if;
  end loop;
  insert into rooms(code, mode, max_players, invest_minutes) values (c, p_mode, p_max, p_minutes) returning * into r;
  insert into players(room_id, name, seat) values (r.id, left(trim(p_name),20), 1) returning id into pid;
  tok := encode(extensions.gen_random_bytes(24),'hex');
  insert into player_keys values (pid, tok);
  update rooms set host_player = pid where id = r.id returning * into r;
  return _join_payload(r, pid, tok);
end $$;

create or replace function public.join_room(p_code text, p_name text)
returns json language plpgsql security definer set search_path = public as $$
declare r public.rooms; pid uuid; tok text; n int; s int;
begin
  if coalesce(trim(p_name),'') = '' then raise exception 'Name required'; end if;
  select * into r from rooms where code = upper(trim(p_code)) for update;
  if not found then raise exception 'No room with that code'; end if;
  if r.status <> 'lobby' then raise exception 'That game has already started'; end if;
  select count(*) into n from players where room_id = r.id;
  if n >= r.max_players then raise exception 'Room is full'; end if;
  if exists (select 1 from players where room_id = r.id and lower(name) = lower(trim(p_name))) then
    raise exception 'That name is taken in this room';
  end if;
  select min(g) into s from generate_series(1, r.max_players) g
   where g not in (select seat from players where room_id = r.id);
  insert into players(room_id, name, seat) values (r.id, left(trim(p_name),20), s) returning id into pid;
  tok := encode(extensions.gen_random_bytes(24),'hex');
  insert into player_keys values (pid, tok);
  return _join_payload(r, pid, tok);
end $$;

create or replace function public.leave_room(p_player uuid, p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare pl public.players; r public.rooms; nxt uuid;
begin
  pl := _auth(p_player, p_token);
  select * into r from rooms where id = pl.room_id for update;
  if r.status <> 'lobby' then raise exception 'You can only leave from the lobby'; end if;
  delete from players where id = pl.id;
  if r.host_player = pl.id then
    select id into nxt from players where room_id = r.id order by seat limit 1;
    if nxt is null then delete from rooms where id = r.id;
    else update rooms set host_player = nxt where id = r.id; end if;
  end if;
end $$;

create or replace function public.update_settings(p_player uuid, p_token text, p_mode text, p_max int, p_minutes int)
returns void language plpgsql security definer set search_path = public as $$
declare pl public.players; r public.rooms; n int;
begin
  pl := _auth(p_player, p_token);
  select * into r from rooms where id = pl.room_id for update;
  if r.host_player <> pl.id then raise exception 'Only the host can change settings'; end if;
  if r.status <> 'lobby' then raise exception 'Game already started'; end if;
  if p_mode = 'full' and (p_max < 4 or p_max > 12) then raise exception 'Full mode needs 4–12 players'; end if;
  if p_mode = 'casual' and (p_max < 3 or p_max > 8) then raise exception 'Casual mode needs 3–8 players'; end if;
  select count(*) into n from players where room_id = r.id;
  if p_max < n then raise exception 'More players already joined'; end if;
  update rooms set mode = p_mode, max_players = p_max, invest_minutes = greatest(1, least(60, p_minutes)) where id = r.id;
end $$;

create or replace function public.start_game(p_player uuid, p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare pl public.players; r public.rooms; n int; maxn int; p record; i int := 0; nums int[];
begin
  pl := _auth(p_player, p_token);
  select * into r from rooms where id = pl.room_id for update;
  if r.host_player <> pl.id then raise exception 'Only the host can start'; end if;
  if r.status <> 'lobby' then raise exception 'Game already started'; end if;
  select count(*) into n from players where room_id = r.id;
  if n < (case when r.mode = 'full' then 4 else 3 end) then raise exception 'Not enough players yet'; end if;
  maxn := case when r.mode = 'full' then 100 else 30 end;
  select array_agg(g) into nums from (select g from generate_series(1, maxn) g order by random() limit n) t;
  delete from secrets where room_id = r.id;
  for p in select id from players where room_id = r.id order by seat loop
    i := i + 1;
    insert into secrets(player_id, room_id, number) values (p.id, r.id, nums[i]);
  end loop;
  update players set tickets = _starting_tickets(r.mode), ready = false, guessed = false,
    score = 0, own_points = 0, guess_points = 0, secret_bonus = 0, revealed_number = null
   where room_id = r.id;
  update rooms set status = 'briefing', phase_ends_at = null where id = r.id;
end $$;

create or replace function public.set_ready(p_player uuid, p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare pl public.players; r public.rooms;
begin
  pl := _auth(p_player, p_token);
  select * into r from rooms where id = pl.room_id for update;
  if r.status <> 'briefing' then return; end if;
  update players set ready = true where id = pl.id;
  if not exists (select 1 from players where room_id = r.id and not ready) then
    update rooms set status = 'investigation',
      phase_ends_at = now() + make_interval(mins => r.invest_minutes) where id = r.id;
  end if;
end $$;

-- ───────────────────────── investigation ─────────────────────────
create or replace function public.use_ticket(p_player uuid, p_token text, p_target uuid, p_ticket text)
returns json language plpgsql security definer set search_path = public as $$
declare pl public.players; r public.rooms; tgt public.players; a int; b int; left_n int; res text; vid bigint;
begin
  pl := _auth(p_player, p_token);
  select * into r from rooms where id = pl.room_id for update;
  if r.status <> 'investigation' or now() > r.phase_ends_at then raise exception 'Investigation is closed'; end if;
  select * into tgt from players where id = p_target and room_id = r.id;
  if not found then raise exception 'Unknown player'; end if;
  if tgt.id = pl.id then raise exception 'You cannot visit yourself'; end if;
  left_n := coalesce((pl.tickets ->> p_ticket)::int, 0);
  if left_n <= 0 then raise exception 'No % tickets left', p_ticket; end if;
  if exists (select 1 from visits where room_id = r.id and from_player = pl.id and to_player = tgt.id and ticket = p_ticket) then
    raise exception 'You already used that ticket on this player';
  end if;
  select number into a from secrets where player_id = pl.id;
  select number into b from secrets where player_id = tgt.id;
  res := _clue(r.mode, p_ticket, a, b);
  insert into visits(room_id, from_player, to_player, ticket) values (r.id, pl.id, tgt.id, p_ticket) returning id into vid;
  insert into clues(visit_id, room_id, from_player, to_player, ticket, result) values (vid, r.id, pl.id, tgt.id, p_ticket, res);
  update players set tickets = jsonb_set(tickets, array[p_ticket], to_jsonb(left_n - 1)) where id = pl.id;
  return json_build_object('visit_id', vid, 'result', res);
end $$;

create or replace function public.my_clues(p_player uuid, p_token text)
returns table(visit_id bigint, from_player uuid, to_player uuid, ticket text, result text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare pl public.players;
begin
  pl := _auth(p_player, p_token);
  return query select c.visit_id, c.from_player, c.to_player, c.ticket, c.result, c.created_at
    from clues c where c.room_id = pl.room_id and (c.from_player = pl.id or c.to_player = pl.id)
    order by c.created_at;
end $$;

-- ───────────────────────── guessing & scoring ─────────────────────────
create or replace function public._finalize(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- own guess: +5 right, -5 wrong
  update players p set own_points = coalesce((
      select case when g.value = s.number then 5 else -5 end
        from guesses g join secrets s on s.player_id = g.player_id
       where g.player_id = p.id and g.target_player = p.id), 0)
   where p.room_id = p_room;
  -- others: +2 for every correct guess of another player's number
  update players p set guess_points = 2 * (
      select count(*) from guesses g join secrets s on s.player_id = g.target_player
       where g.player_id = p.id and g.target_player <> p.id and g.value = s.number)
   where p.room_id = p_room;
  -- secret kept: +3 if nobody else guessed your number
  update players p set secret_bonus = case when exists (
      select 1 from guesses g join secrets s on s.player_id = g.target_player
       where g.target_player = p.id and g.player_id <> p.id and g.value = s.number) then 0 else 3 end
   where p.room_id = p_room;
  update players p set score = own_points + guess_points + secret_bonus,
    revealed_number = (select number from secrets s where s.player_id = p.id)
   where p.room_id = p_room;
  update rooms set status = 'reveal', phase_ends_at = null where id = p_room;
end $$;

create or replace function public.submit_guesses(p_player uuid, p_token text, p_guesses jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare pl public.players; r public.rooms; k text; v jsonb; maxn int;
begin
  pl := _auth(p_player, p_token);
  select * into r from rooms where id = pl.room_id for update;
  if r.status <> 'guessing' then raise exception 'Guessing is closed'; end if;
  maxn := case when r.mode = 'full' then 100 else 30 end;
  delete from guesses where player_id = pl.id;
  for k, v in select * from jsonb_each(coalesce(p_guesses,'{}'::jsonb)) loop
    if v is null or jsonb_typeof(v) <> 'number' then continue; end if;
    if (v::text)::int < 1 or (v::text)::int > maxn then continue; end if;
    if not exists (select 1 from players where id = k::uuid and room_id = r.id) then continue; end if;
    insert into guesses(player_id, target_player, room_id, value) values (pl.id, k::uuid, r.id, (v::text)::int);
  end loop;
  update players set guessed = true where id = pl.id;
  if not exists (select 1 from players where room_id = r.id and not guessed) then
    perform _finalize(r.id);
  end if;
end $$;

-- anyone may poke the clock; advances only when the phase deadline has passed
create or replace function public.tick(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.rooms;
begin
  select * into r from rooms where id = p_room for update;
  if not found or r.phase_ends_at is null or now() < r.phase_ends_at then return; end if;
  if r.status = 'investigation' then
    update rooms set status = 'guessing', phase_ends_at = now() + interval '3 minutes' where id = r.id;
  elsif r.status = 'guessing' then
    perform _finalize(r.id);
  end if;
end $$;

-- host override: skip to next phase now
create or replace function public.force_advance(p_player uuid, p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare pl public.players; r public.rooms;
begin
  pl := _auth(p_player, p_token);
  select * into r from rooms where id = pl.room_id for update;
  if r.host_player <> pl.id then raise exception 'Only the host can do that'; end if;
  if r.status = 'briefing' then
    update players set ready = true where room_id = r.id;
    update rooms set status = 'investigation', phase_ends_at = now() + make_interval(mins => r.invest_minutes) where id = r.id;
  elsif r.status = 'investigation' then
    update rooms set status = 'guessing', phase_ends_at = now() + interval '3 minutes' where id = r.id;
  elsif r.status = 'guessing' then
    perform _finalize(r.id);
  end if;
end $$;

create or replace function public.reveal_guesses(p_room uuid)
returns table(player_id uuid, target_player uuid, value int)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room and status = 'reveal') then return; end if;
  return query select g.player_id, g.target_player, g.value from guesses g where g.room_id = p_room;
end $$;

create or replace function public.rematch(p_player uuid, p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare pl public.players; r public.rooms;
begin
  pl := _auth(p_player, p_token);
  select * into r from rooms where id = pl.room_id for update;
  if r.host_player <> pl.id then raise exception 'Only the host can start a rematch'; end if;
  if r.status <> 'reveal' then raise exception 'Game not finished'; end if;
  delete from visits where room_id = r.id;
  delete from guesses where room_id = r.id;
  delete from secrets where room_id = r.id;
  update players set tickets = '{}'::jsonb, ready = false, guessed = false, score = 0,
    own_points = 0, guess_points = 0, secret_bonus = 0, revealed_number = null where room_id = r.id;
  update rooms set status = 'lobby', phase_ends_at = null, round = round + 1 where id = r.id;
end $$;

-- ───────────────────────── grants ─────────────────────────
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.create_room(text,text,int,int), public.join_room(text,text), public.leave_room(uuid,text),
  public.update_settings(uuid,text,text,int,int), public.start_game(uuid,text), public.set_ready(uuid,text),
  public.use_ticket(uuid,text,uuid,text), public.my_clues(uuid,text), public.submit_guesses(uuid,text,jsonb),
  public.tick(uuid), public.force_advance(uuid,text), public.reveal_guesses(uuid), public.rematch(uuid,text)
to anon, authenticated;
