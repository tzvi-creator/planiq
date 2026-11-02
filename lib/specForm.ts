import type { ProjectData } from './types';
import { summarize, openingRows, openingSchedule, fixtureRows, roomRows } from './quantities';

// טופס שאלות להשלמת נתוני מפרט מכר (חוק המכר (דירות), תשל"ג-1973, ותקנות המכר (דירות) (טופס של מפרט)).
// שדות שאינם ניתנים להפקה מהתכניות מסומנים כ"נדרש מילוי".
export interface Field { key: string; label: string; type: 'text' | 'textarea' | 'select' | 'number'; options?: string[]; help?: string }
export interface Section { id: string; title: string; fields: Field[] }

const yn = ['כן', 'לא', 'לא רלוונטי'];

export const SPEC_SECTIONS: Section[] = [
  { id: 'general', title: '1. פרטים כלליים', fields: [
    { key: 'seller', label: 'שם המוכר / החברה היזמית', type: 'text' },
    { key: 'blockParcel', label: 'גוש / חלקה / מגרש', type: 'text' },
    { key: 'permit', label: 'מספר היתר בנייה ותאריכו', type: 'text' },
    { key: 'architect', label: 'שם האדריכל', type: 'text' },
    { key: 'delivery', label: 'מועד מסירה משוער', type: 'text' },
    { key: 'standardsNote', label: 'תקנים והתייחסות לתכנית מכר (מספר תכנית)', type: 'text' },
  ] },
  { id: 'building', title: '2. מבנה הבניין', fields: [
    { key: 'structure', label: 'שלד ומבנה (חומרים, שיטת בנייה)', type: 'textarea' },
    { key: 'outerWalls', label: 'קירות חוץ וחיפוי חזית', type: 'textarea' },
    { key: 'interiorWalls', label: 'קירות פנים (בלוקים/גבס) ועוביים', type: 'textarea' },
    { key: 'ceilingHeight', label: 'גובה תקרה נטו (מ\')', type: 'text' },
    { key: 'roof', label: 'גג ואיטום', type: 'textarea' },
    { key: 'elevator', label: 'מעליות (מספר, נשיאה, יצרן)', type: 'text' },
    { key: 'lobby', label: 'לובי, חדר מדרגות ושטחים משותפים', type: 'textarea' },
    { key: 'parking', label: 'חניה ומחסן (מספר/מיקום)', type: 'text' },
  ] },
  { id: 'finishes', title: '3. גמרים', fields: [
    { key: 'floorTiles', label: 'ריצוף (סוג, מידות, דרגת החלקה)', type: 'textarea' },
    { key: 'wallTiles', label: 'חיפוי קירות (חדרי רחצה, מטבח)', type: 'textarea' },
    { key: 'paint', label: 'צבע וטיח פנים', type: 'text' },
    { key: 'skirting', label: 'פנלים / פסי גמר', type: 'text' },
    { key: 'ceilingFinish', label: 'גמר תקרות (כולל תקרות אקוסטיות/גבס)', type: 'text' },
  ] },
  { id: 'doors', title: '4. דלתות וחלונות', fields: [
    { key: 'entranceDoor', label: 'דלת כניסה (סוג, דרגת בטיחות, יצרן)', type: 'text' },
    { key: 'innerDoors', label: 'דלתות פנים (חומר, גימור, מנעולים)', type: 'text' },
    { key: 'mamadDoor', label: 'דלת וחלון ממ"ד (תקן, יצרן)', type: 'text' },
    { key: 'windows', label: 'חלונות (חומר מסגרת, זיגוג, פרופיל)', type: 'textarea' },
    { key: 'shutters', label: 'תריסים (סוג והפעלה)', type: 'text' },
  ] },
  { id: 'kitchen', title: '5. מטבח וארונות', fields: [
    { key: 'kitchenCabinets', label: 'ארון מטבח (חומר, אורך משוער, משטח עבודה)', type: 'textarea' },
    { key: 'kitchenAppliances', label: 'כלי מטבח/אביזרים כלולים (כיריים, תנור, מדיח)', type: 'text' },
    { key: 'closets', label: 'ארונות קיר / הלבשה כלולים', type: 'text' },
  ] },
  { id: 'sanitary', title: '6. אינסטלציה וכלים סניטריים', fields: [
    { key: 'sanitaryWare', label: 'כלים סניטריים (אסלות, כיורים) – יצרן/דגם', type: 'textarea' },
    { key: 'faucets', label: 'סוללות וברזים', type: 'text' },
    { key: 'waterHeating', label: 'מערכת מים חמים (דוד שמש / חשמלי / מרכזי)', type: 'text' },
    { key: 'pipes', label: 'צנרת מים וביוב (חומרים)', type: 'text' },
    { key: 'waterproof', label: 'איטום אזורים רטובים', type: 'text' },
  ] },
  { id: 'electric', title: '7. חשמל, תקשורת ומיזוג', fields: [
    { key: 'panelSpec', label: 'לוח חשמל דירתי (זרם, מפסקי פחת)', type: 'text' },
    { key: 'wiring', label: 'סוג חיווט ומפסקים/שקעים (יצרן וסדרה)', type: 'text' },
    { key: 'comms', label: 'תקשורת (טלפון, טלוויזיה, אינטרנט, סיבים)', type: 'text' },
    { key: 'hvac', label: 'מיזוג אוויר (מרכזי / מפוצל / הכנה בלבד)', type: 'text' },
    { key: 'smart', label: 'אינטרקום ומערכות נוספות', type: 'text' },
  ] },
  { id: 'external', title: '8. פיתוח ושטחים חיצוניים', fields: [
    { key: 'balcony', label: 'מרפסות (ריצוף, מעקות, ניקוז)', type: 'text' },
    { key: 'garden', label: 'גינה / חצר פרטית', type: 'text' },
    { key: 'commonDev', label: 'פיתוח שטחים משותפים', type: 'textarea' },
  ] },
  { id: 'legal', title: '9. סעיפים משפטיים', fields: [
    { key: 'warranty', label: 'תקופות אחריות (בדק ואחריות)', type: 'text' },
    { key: 'extras', label: 'הערות / חריגים מיוחדים', type: 'textarea' },
  ] },
];

export interface Derived { key: string; label: string; value: string }

// נתונים הנגזרים אוטומטית מהתכניות
export function deriveSpecFacts(d: ProjectData): Derived[] {
  const out: Derived[] = [];
  const sum = summarize(d);
  const rooms = roomRows(d);
  const apartmentRooms = rooms.filter((r) => r.unitId);
  const unitAreas = d.units.map((u) => ({ u, a: apartmentRooms.filter((r) => r.unitId === u.id).reduce((s, r) => s + r.areaM2, 0) })).filter((x) => x.a > 0);
  out.push({ key: 'floors', label: 'מספר קומות', value: String(d.floors.length) });
  out.push({ key: 'units', label: 'מספר דירות', value: String(d.units.length) });
  for (const { u, a } of unitAreas) out.push({ key: 'area-' + u.id, label: `שטח ${u.name} (נטו, כולל מרפסת)`, value: a.toFixed(2) + ' מ"ר' });
  const sched = openingSchedule(openingRows(d));
  out.push({ key: 'doors', label: 'דלתות (סה"כ)', value: String(sum.doors) });
  out.push({ key: 'windows', label: 'חלונות ודלתות הזזה (סה"כ)', value: String(sum.windows) });
  for (const g of sched) out.push({ key: 'op-' + g.key, label: `${g.typeLabel} ${g.widthM.toFixed(2)}×${g.heightM?.toFixed(2) ?? '—'}${g.tags.length ? ' (' + g.tags.join(', ') + ')' : ''}`, value: `${g.count} יח'` });
  out.push({ key: 'sockets', label: 'שקעי חשמל (סה"כ)', value: String(sum.sockets) });
  out.push({ key: 'elpts', label: 'נקודות חשמל כולל תאורה/תקשורת', value: String(sum.electricalPoints) });
  out.push({ key: 'plpts', label: 'אביזרי אינסטלציה', value: String(sum.plumbingPoints) });
  const kinds = new Map<string, number>();
  for (const f of fixtureRows(d, 'plumbing')) kinds.set(f.fixture.kind, (kinds.get(f.fixture.kind) || 0) + 1);
  return out;
}

export function specCompleteness(answers: Record<string, string>) {
  const keys = SPEC_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));
  const filled = keys.filter((k) => (answers[k] || '').trim()).length;
  return { filled, total: keys.length };
}
