import { NextRequest, NextResponse } from 'next/server';
import { loadProjectData, q, q1 } from '@/lib/db';
import { aiClient, aiModel } from '@/lib/ai';
import { SPEC_SECTIONS, deriveSpecFacts } from '@/lib/specForm';
import { roomRows, openingRows, openingSchedule, fixtureRows, fixtureTable } from '@/lib/quantities';

export const maxDuration = 120;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, ctx: Ctx) {
  const pid = Number((await ctx.params).id);
  const a = await q1<any>('select answers from spec_answers where project_id=$1', [pid]);
  const specs = await q('select id, created_at, content from specs where project_id=$1 order by id desc limit 5', [pid]);
  return NextResponse.json({ answers: a?.answers ?? {}, specs });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const pid = Number((await ctx.params).id);
  const { answers } = await req.json();
  await q(
    `insert into spec_answers(project_id,answers) values($1,$2)
     on conflict (project_id) do update set answers=excluded.answers, updated_at=now()`,
    [pid, JSON.stringify(answers || {})],
  );
  return NextResponse.json({ ok: true });
}

// יצירת מפרט מכר באמצעות AI מהתשובות + הנתונים שנגזרו מהתכניות
export async function POST(_: NextRequest, ctx: Ctx) {
  const pid = Number((await ctx.params).id);
  const data = (await loadProjectData(pid)) as any;
  if (!data) return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 });
  const a = await q1<any>('select answers from spec_answers where project_id=$1', [pid]);
  const answers: Record<string, string> = a?.answers ?? {};

  const facts = deriveSpecFacts(data);
  const sched = openingSchedule(openingRows(data)).map((g) => `${g.typeLabel} ${g.widthM.toFixed(2)}×${g.heightM?.toFixed(2) ?? '?'} מ' – ${g.count} יח'${g.tags.length ? ' [' + g.tags.join(',') + ']' : ''}${g.assumed ? ' (מידות מוערכות)' : ''}`);
  const rr = roomRows(data).filter((r) => r.unitId);
  const roomsByUnit: Record<string, string[]> = {};
  for (const r of rr) (roomsByUnit[r.unitName] ||= []).push(`${r.name} ${r.areaM2.toFixed(2)} מ"ר`);
  const el = fixtureTable(fixtureRows(data, 'electrical'), 'unit').table.map((t) => `${t.label}: ${t.total}`);
  const pl = fixtureTable(fixtureRows(data, 'plumbing'), 'unit').table.map((t) => `${t.label}: ${t.total}`);

  const formText = SPEC_SECTIONS.map((s) =>
    `## ${s.title}\n` + s.fields.map((f) => `- ${f.label}: ${(answers[f.key] || '').trim() || '[לא נמסר]'}`).join('\n'),
  ).join('\n\n');

  const prompt = `כתוב מפרט מכר מלא לדירות בעברית משפטית-הנדסית מסודרת, בהתאם למבנה "מפרט" לפי חוק המכר (דירות), התשל"ג-1973, ותקנות המכר (דירות) (טופס של מפרט).
כללים מחייבים:
1. השתמש אך ורק בנתונים שלהלן (נתוני תכניות + תשובות שנמסרו). אל תמציא מפרטים, יצרנים, תקנים או מידות שלא נמסרו.
2. כל פרט שלא נמסר – כתוב במקומו: "[נדרש להשלמה על ידי המוכר]".
3. פרט בנפרד כל סעיף: פרטים כלליים; תיאור הבניין; תיאור הדירה (חללים ושטחים לכל דירה); רצפות וחיפויים; דלתות וחלונות (כולל טבלת פתחים); מטבח וארונות; אינסטלציה וכלים סניטריים; חשמל, תקשורת ומיזוג (כולל כמויות נקודות); איטום ובידוד; שטחים משותפים ופיתוח; אחריות ובדק.
4. פתח בכותרת, ובסוף הוסף הערה: "טיוטה שנוצרה אוטומטית – נדרשת בדיקה של עורך דין ושל האדריכל/מהנדס לפני חתימה".
5. פורמט: Markdown עם כותרות (##), טבלאות Markdown לפתחים ולחללים.

פרויקט: ${data.project.name}, כתובת: ${data.project.address || '[לא צוין]'}.

נתונים שנגזרו מהתכניות:
${facts.map((f) => `- ${f.label}: ${f.value}`).join('\n')}

חללים לפי דירה:
${Object.entries(roomsByUnit).map(([u, r]) => `- ${u}: ${r.join('; ')}`).join('\n')}

טבלת פתחים (כל הפרויקט):
${sched.join('\n')}

כמויות אביזרי חשמל: ${el.join(', ') || 'אין נתונים'}
כמויות אביזרי אינסטלציה: ${pl.join(', ') || 'אין נתונים'}

תשובות המוכר לטופס:
${formText}`;

  try {
    const r = await aiClient().chat.completions.create({
      model: aiModel(), temperature: 0.2, max_tokens: 7000,
      messages: [{ role: 'system', content: 'אתה יועץ משפטי-הנדסי המתמחה בהכנת מפרטי מכר לדירות בישראל. אתה מקפיד על דיוק ואינך ממציא עובדות.' }, { role: 'user', content: prompt }],
    });
    const content = r.choices[0]?.message?.content || '';
    const row = await q1('insert into specs(project_id,content) values($1,$2) returning id, created_at, content', [pid, content]);
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: 'יצירת המפרט נכשלה: ' + (e?.message || e) }, { status: 502 });
  }
}
