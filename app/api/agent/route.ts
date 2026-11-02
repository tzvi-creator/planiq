import { NextRequest, NextResponse } from 'next/server';
import { loadProjectData } from '@/lib/db';
import { aiClient, aiModel } from '@/lib/ai';
import { DEFAULT_PARAMS, RULE_GROUPS, runChecks } from '@/lib/standards';
import { fixtureRows, fixtureTable, openingRows, openingSchedule, roomRows, summarize } from '@/lib/quantities';
import { DISCIPLINES, PLAN_KINDS, type ProjectData } from '@/lib/types';

export const maxDuration = 120;

const tools: any[] = [
  { type: 'function', function: { name: 'get_overview', description: 'סיכום הפרויקט: קומות, דירות, תכניות וכמויות כוללות (שטח, דלתות, חלונות, נקודות חשמל ואינסטלציה). אפשר לסנן לפי קומה/דירה.', parameters: { type: 'object', properties: { floorId: { type: 'number' }, unitId: { type: 'number' } } } } },
  { type: 'function', function: { name: 'list_plans', description: 'רשימת התכניות בפרויקט עם תחום, קומה, סוג וסטטוס ניתוח.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_rooms', description: 'טבלת חללים: שם, סוג, דירה, שטח, מידות והיקף.', parameters: { type: 'object', properties: { floorId: { type: 'number' }, unitId: { type: 'number' } } } } },
  { type: 'function', function: { name: 'get_openings', description: 'טבלת פתחים (דלתות/חלונות) מקובצת לפי סוג ומידה.', parameters: { type: 'object', properties: { floorId: { type: 'number' }, unitId: { type: 'number' } } } } },
  { type: 'function', function: { name: 'get_fixtures', description: 'כמויות אביזרי חשמל או אינסטלציה, מקובצות לפי חלל או דירה.', parameters: { type: 'object', properties: { discipline: { type: 'string', enum: ['electrical', 'plumbing'] }, groupBy: { type: 'string', enum: ['room', 'unit'] }, floorId: { type: 'number' }, unitId: { type: 'number' } }, required: ['discipline'] } } },
  { type: 'function', function: { name: 'run_standards_check', description: `הרצת בדיקת תקנים (ערכי ייחוס). קבוצות: ${RULE_GROUPS.map((g) => g.id).join(', ')}.`, parameters: { type: 'object', properties: { groups: { type: 'array', items: { type: 'string' } }, floorId: { type: 'number' }, unitId: { type: 'number' } } } } },
];

function runTool(name: string, args: any, d: ProjectData): any {
  const scope = { floorId: args?.floorId ?? null, unitId: args?.unitId ?? null };
  switch (name) {
    case 'get_overview': {
      const s = summarize(d, scope);
      return { project: d.project.name, floors: d.floors.map((f) => ({ id: f.id, name: f.name })), units: d.units.map((u) => ({ id: u.id, name: u.name, floorId: u.floor_id })), plans: d.plans.length, totals: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 100) / 100 : v])) };
    }
    case 'list_plans':
      return d.plans.map((p) => ({ id: p.id, name: p.name, discipline: DISCIPLINES[p.discipline], kind: PLAN_KINDS[p.kind], floor: d.floors.find((f) => f.id === p.floor_id)?.name ?? null, analyzed: !!p.analysis, scaleKnown: !!p.mpp }));
    case 'get_rooms':
      return roomRows(d, scope).map((r) => ({ unit: r.unitName, room: r.name, type: r.typeLabel, areaM2: +r.areaM2.toFixed(2), widthM: +r.widthM.toFixed(2), lengthM: +r.lengthM.toFixed(2), perimeterM: +r.perimeterM.toFixed(2) }));
    case 'get_openings':
      return openingSchedule(openingRows(d, scope)).map((g) => ({ type: g.typeLabel, widthM: g.widthM, heightM: g.heightM, count: g.count, tags: g.tags, assumedDims: g.assumed }));
    case 'get_fixtures': {
      const t = fixtureTable(fixtureRows(d, args.discipline, scope), args.groupBy === 'room' ? 'room' : 'unit');
      return t.table.map((r) => ({ item: r.label, total: r.total, breakdown: r.counts }));
    }
    case 'run_standards_check': {
      const groups = Array.isArray(args?.groups) && args.groups.length ? args.groups : RULE_GROUPS.map((g) => g.id);
      const res = runChecks(d, groups, DEFAULT_PARAMS, scope);
      return { note: 'ערכי ייחוס ברירת מחדל – יש לאמת מול התקנה', failed: res.filter((f) => f.severity === 'fail').map((f) => `${f.title}: ${f.detail}`), warnings: res.filter((f) => f.severity === 'warn').map((f) => `${f.title}: ${f.detail}`), passed: res.filter((f) => f.severity === 'pass').length };
    }
  }
  return { error: 'כלי לא מוכר' };
}

export async function POST(req: NextRequest) {
  const { messages, context } = await req.json();
  const projectId = Number(context?.projectId);
  const data = projectId ? ((await loadProjectData(projectId)) as ProjectData | null) : null;

  const ctxLine = data
    ? `הפרויקט הפעיל: "${data.project.name}" (id ${data.project.id}). קומה פעילה: ${data.floors.find((f) => f.id === context.floorId)?.name ?? 'הכול'} (id ${context.floorId ?? '—'}). דירה פעילה: ${data.units.find((u) => u.id === context.unitId)?.name ?? 'הכול'} (id ${context.unitId ?? '—'}). תכנית פתוחה: ${data.plans.find((p) => p.id === context.planId)?.name ?? 'אין'}.`
    : 'לא נבחר פרויקט. ניתן להסביר על המערכת בלבד.';

  const system = `אתה "הסוכן" של PlanIQ – מערכת בעברית לקריאת תכניות בניין (אדריכלות, חשמל, אינסטלציה, קונסטרוקציה), הפקת כמויות ומפרט מכר, בדיקת תקנים וסופר פוזיציה.
ענה בעברית ברורה ותמציתית. השתמש בכלים כדי להביא נתונים אמיתיים מהפרויקט – אל תנחש מספרים. אם נתון חסר (למשל תכנית שלא נותחה או קנה מידה לא ידוע) – אמור זאת והצע את הפעולה במסך המתאים.
ערכי התקנות במערכת הם ערכי ייחוס ויש לאמת אותם; אל תציג אותם כייעוץ משפטי מחייב. אתה קורא נתונים בלבד ואינך משנה את הפרויקט.
${ctxLine}
הסבר על המסכים: "תכנית וחללים" (תצוגה, שטחים, ניתוח AI, כיול קנה מידה), "כמויות ומפרט", "בדיקת תקנים", "סופר פוזיציה".`;

  const convo: any[] = [{ role: 'system', content: system }, ...(messages || []).slice(-16)];
  try {
    for (let i = 0; i < 6; i++) {
      const r = await aiClient().chat.completions.create({
        model: aiModel(), temperature: 0.2, max_tokens: 2500, messages: convo,
        ...(data ? { tools, tool_choice: 'auto' as const } : {}),
      });
      const msg = r.choices[0].message;
      if (!msg.tool_calls?.length) return NextResponse.json({ reply: msg.content || '' });
      convo.push(msg);
      for (const tc of msg.tool_calls as any[]) {
        let out: any;
        try { out = runTool(tc.function.name, JSON.parse(tc.function.arguments || '{}'), data!); } catch (e: any) { out = { error: String(e?.message || e) }; }
        convo.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out).slice(0, 12000) });
      }
    }
    return NextResponse.json({ reply: 'לא הצלחתי להשלים את הבקשה בזמן סביר. נסו לנסח אותה מחדש.' });
  } catch (e: any) {
    return NextResponse.json({ error: 'שגיאת סוכן: ' + (e?.message || e) }, { status: 502 });
  }
}
