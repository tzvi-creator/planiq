import { NextRequest, NextResponse } from 'next/server';
import { aiClient, aiModel, parseJsonLoose } from '@/lib/ai';

export const maxDuration = 120;

// ניתוח חזותי של תמונת החפיפה (תכניות מונחות זו על זו) – משלים את הבדיקה האוטומטית
export async function POST(req: NextRequest) {
  const { imageDataUrl, layers, found } = await req.json();
  if (!imageDataUrl?.startsWith('data:image/')) return NextResponse.json({ error: 'חסרה תמונה' }, { status: 400 });
  const prompt = `לפניך תמונה של סופר פוזיציה: תכניות של תחומים שונים בבניין מונחות זו על זו (השכבות: ${layers}). האדריכלות באפור, שכבות אחרות בצבעים.
בדוק חזותית סתירות והתנגשויות בין התכניות (למשל אביזרי חשמל/אינסטלציה בתוך קירות, בפתחים או בחללים לא מתאימים, אלמנטים שחופפים, חוסר התאמה בין קירות).
כבר נמצאו אוטומטית ${found} התנגשויות – אל תחזור עליהן אלא הוסף רק ממצאים נוספים שאתה רואה בבירור.
החזר JSON בלבד: { "summary": "סיכום קצר בעברית", "issues": [ { "title": "...", "detail": "...", "x": 0..1, "y": 0..1 } ] } כאשר x,y הם מיקום מנורמל בתמונה (0,0 = פינה שמאלית עליונה). אם לא ברור – החזר issues ריק ואל תמציא.`;
  try {
    const r = await aiClient().chat.completions.create({
      model: aiModel(), temperature: 0.1, max_tokens: 2500, response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }] }],
    });
    return NextResponse.json(parseJsonLoose(r.choices[0]?.message?.content || ''));
  } catch (e: any) {
    return NextResponse.json({ error: 'ניתוח ה-AI נכשל: ' + (e?.message || e) }, { status: 502 });
  }
}
