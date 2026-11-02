create table if not exists projects (
  id serial primary key,
  name text not null,
  address text,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists floors (
  id serial primary key,
  project_id int not null references projects(id) on delete cascade,
  name text not null,
  sort int not null default 0
);

create table if not exists units (
  id serial primary key,
  project_id int not null references projects(id) on delete cascade,
  floor_id int references floors(id) on delete set null,
  name text not null
);

create table if not exists plans (
  id serial primary key,
  project_id int not null references projects(id) on delete cascade,
  floor_id int references floors(id) on delete set null,
  name text not null,
  filename text,
  discipline text not null default 'architecture',
  kind text not null default 'plan',
  mime text not null,
  data bytea not null,
  width int not null,
  height int not null,
  paper_width_mm real,
  scale_ratio int,
  mpp real,
  scale_source text,
  analysis jsonb,
  analyzed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists plans_project_idx on plans(project_id);

create table if not exists spec_answers (
  project_id int primary key references projects(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists specs (
  id serial primary key,
  project_id int not null references projects(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists alignments (
  id serial primary key,
  project_id int not null references projects(id) on delete cascade,
  base_plan_id int not null references plans(id) on delete cascade,
  overlay_plan_id int not null references plans(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  unique (base_plan_id, overlay_plan_id)
);

create table if not exists reports (
  id serial primary key,
  project_id int not null references projects(id) on delete cascade,
  title text not null,
  content jsonb not null,
  created_at timestamptz not null default now()
);
