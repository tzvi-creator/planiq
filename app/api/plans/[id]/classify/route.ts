import { NextRequest, NextResponse } from 'next/server';
import { q1 } from '@/lib/db';
import { aiClient, aiModel, parseJsonLoose } from '@/lib/ai';
import { ROOM_TYPES, type Pt } from '@/lib/types';
import { pointInPoly } from '@/lib/geometry';

export const maxDuration = 120;
type Ctx = { params: Promise<{ id: string }> };

// רמזי טקסט -> ייעוד (מילון בסיסי; ההחלטה הסופית ל-AI)
const DICT: [RegExp, string][] = [
  [/ממ["״']?ד|מרחב\s*מוגן/, 'mamad'],
  [/שירותים|שרותים|ש\.?ח|WC/i, 'toilet'],
  [/אמבט|מקלחת|רחצה|חדר\s*רחצה/, 'bath'],
  [/מטבח/, 'kitchen'],
  [/הורים/, 'master'],
  [/סלון|פינת\s*אוכל|מגורים/, 'salon'],
  [/מרפסת|גזוזטרה|סוכה/, 'balcony'],
  [/מסדרון|פרוזדור/, 'corridor'],
  [/מחסן|שירות|ארון/, 'storage'],
  [/כביסה|מסתור/, 'laundry'],
  [/מדרגות|מעלית/, 'stairs'],
  [/מבואה|כניסה|לובי/, 'entry'],
  [/חדר/, 'bedroom'],
];

// קלט: תמונת סקירה עם חללים ממוספרים + מצולעים מנורמלים. פלט: שם וייעוד לכל חלל.
export async function POST(req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const { imageDataUrl, rooms } = (await req.json()) as {
    imageDataUrl: string;
    rooms: { n: number; polygon: Pt[]; areaM2: number; widthM: number; lengthM: number }[];
  };
  if (!imageDataUrl?.startsWith('data:image/') || !rooms?.length) return NextResponse.json({ error: 'חסרים נתונים' }, { status: 400 });
  const row = await q1<any>('select texts from plans where id=$1', [id]);
  const texts: { t: string; x: number; y: number }[] = Array.isArray(row?.texts) ? row.texts : [];

  const info = rooms.map((r) => {
    const inside = texts.filter((t) => pointInPoly([t.x, t.y], r.polygon)).map((t) => t.t);
    const hint = DICT.find(([re]) => inside.some((s) => re.test(s)));
    return { ...r, inside, hint: hint?.[1] };
  });

  const types = Object.entries(ROOM_TYPES).map(([k, v]) => `${k}=${v.label}`).join(', ');
  const prompt = `בתמונה תכנית אדריכלית (חיתוך). חללים שזוהו אוטומטית לפי הקירות מסומנים במספרים ובצבעים.
עבור כל חלל מספר, קבע שם בעברית וייעוד (type) מתוך: ${types}.
הנחיות: סלון בדרך כלל החלל הגדול; מטבח – ארונות ושיש; חדרי רחצה/שירותים – כלים סניטריים; ממ"ד – חדר עם קירות עבים ודלת מגן ו"מרחב מוגן"; מרפסת – חלל חיצוני עם מעקה; מסדרון – חלל צר ארוך. השתמש בטקסטים שנמצאו בתוך כל חלל (אם יש) כעדות ראשית.
אם אזור אינו חלל אמיתי (פיר, מעטפת, שטח חיצוני, חתיכה קטנה שנוצרה מפיצול) – סמן "skip": true.
אם שני מספרים הם בעצם אותו חלל – החזר merge: [[a,b],...].
נתונים לכל חלל:
${info.map((r) => `#${r.n}: שטח ${r.areaM2.toFixed(1)} מ"ר, ${r.lengthM.toFixed(1)}×${r.widthM.toFixed(1)} מ'${r.inside.length ? `, טקסטים בפנים: ${r.inside.slice(0, 12).join(' | ')}` : ''}${r.hint ? `, רמז מילון: ${r.hint}` : ''}`).join('\n')}
החזר JSON בלבד: { "rooms": [ { "n": 1, "name": "סלון", "type": "salon", "skip": false } ], "merge": [[2,3]], "notes": "הערות קצרות" }`;
  try {
    const r = await aiClient().chat.completions.create({
      model: aiModel(), temperature: 0.1, max_tokens: 3000, response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }] }],
    });
    const j = parseJsonLoose(r.choices[0]?.message?.content || '');
    const out = (j.rooms || []).map((x: any) => ({ n: Number(x.n), name: String(x.name || ''), type: (ROOM_TYPES as any)[x.type] ? x.type : 'other', skip: !!x.skip }));
    // השלמה ממילון עבור חללים ש-AI לא החזיר
    for (const r2 of info) if (!out.some((o: any) => o.n === r2.n)) out.push({ n: r2.n, name: r2.inside[0] || `חלל ${r2.n}`, type: r2.hint || 'other', skip: false });
    return NextResponse.json({ rooms: out, merge: Array.isArray(j.merge) ? j.merge : [], notes: j.notes || '' });
  } catch (e: any) {
    return NextResponse.json({ error: 'סיווג ה-AI נכשל: ' + (e?.message || e) }, { status: 502 });
  }
}
