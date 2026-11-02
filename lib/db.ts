import { Pool } from 'pg';

declare global { var __pgPool: Pool | undefined }

export const pool: Pool =
  globalThis.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? undefined : { rejectUnauthorized: false },
    max: 5,
  });
if (process.env.NODE_ENV !== 'production') globalThis.__pgPool = pool;

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const r = await pool.query(text, params);
  return r.rows as T[];
}
export async function q1<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const r = await q<T>(text, params);
  return r[0] ?? null;
}

export const PLAN_COLS =
  'id, project_id, floor_id, name, discipline, kind, mime, width, height, paper_width_mm, scale_ratio, mpp, scale_source, analysis, analyzed_at, filename';

export async function loadProjectData(id: number) {
  const project = await q1('select * from projects where id=$1', [id]);
  if (!project) return null;
  const [floors, units, plans] = await Promise.all([
    q('select * from floors where project_id=$1 order by sort, id', [id]),
    q('select * from units where project_id=$1 order by id', [id]),
    q(`select ${PLAN_COLS} from plans where project_id=$1 order by id`, [id]),
  ]);
  return { project, floors, units, plans };
}
