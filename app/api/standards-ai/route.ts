import { NextRequest, NextResponse } from 'next/server';
import { loadProjectData } from '@/lib/db';
import { aiClient, aiModel, parseJsonLoose } from '@/lib/ai';
import { roomRows, openingRows, fixtureRows, type Scope } from '@/lib/quantities';

export const maxDuration = 120;

// בדיקת תקנות חופשית באמצעות AI: המשתמש מזין תקנות/דרישות בטקסט, והמודל בודק מול נתוני התכניות
export async function POST(req: NextRequest) {
  const { projectId, regulations, scope } = (await req.json()) as { projectId: number; regulations: string; scope?: Scope };
  if (!regulations?.trim()) return NextResponse.json({ error: 'לא הוזנו תקנות לבדיקה' }, { status: 400 });
  const data = (await loadProjectData(projectId)) as any;
  if (!data) return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 });
  const s = scope || {};
  const rooms = roomRows(data, s).map((r) => `${r.unitName} | ${r.name} (${r.typeLabel}) | ${r.areaM2.toFixed(2)} מ"ר | ${r.widthM.toFixed(2)}×${r.lengthM.toFixed(2)} מ'`);
  const ops = openingRows(data, s).map((o) => `${o.unitName} | ${o.roomName} | ${o.opening.type} ${o.opening.tag ?? ''} | ${o.opening.wM.toFixed(2)}×${o.opening.hM?.toFixed(2) ?? '?'}${o.opening.assumed ? ' (הערכה)' : ''}`);
  const fx = [...fixtureRows(data, 'electrical', s), ...fixtureRows(data, 'plumbing', s)].map((f) => `${f.unitName} | ${f.roomName} | ${f.fixture.kind}`);
  const prompt = `בדוק האם נתוני התכניות עומדים בתקנות/הדרישות הבאות.
תקנות לבדיקה (כפי שהוזנו על ידי המשתמש):
${regulations}

נתוני התכניות (לפי הנחת קנה המידה שנקבע):
חללים:\n${rooms.join('\n') || '—'}
פתחים:\n${ops.join('\n') || '—'}
אביזרים:\n${fx.join('\n') || '—'}

החזר JSON בלבד: { "findings": [ { "requirement": "הדרישה", "status": "pass|fail|unknown", "detail": "הסבר קצר עם נתונים", "location": "דירה/חלל או null" } ], "summary": "סיכום בעברית", "caveats": "מגבלות הבדיקה" }
אם הנתונים אינם מספיקים להכרעה – status=unknown. אל תמציא ערכי תקנות שלא הוזנו; אם נדרש ידע חיצוני ציין זאת ב-caveats.`;
  try {
    const r = await aiClient().chat.completions.create({
      model: aiModel(), temperature: 0.1, max_tokens: 4000, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: 'אתה בודק תכניות ישראלי מקצועי. ענה בעברית ב-JSON תקין בלבד.' }, { role: 'user', content: prompt }],
    });
    return NextResponse.json(parseJsonLoose(r.choices[0]?.message?.content || ''));
  } catch (e: any) {
    return NextResponse.json({ error: 'בדיקת ה-AI נכשלה: ' + (e?.message || e) }, { status: 502 });
  }
}
