export type Pt = [number, number]; // נורמליזציה 0..1 (x ביחס לרוחב התמונה, y ביחס לגובה)

export type RoomType =
  | 'salon' | 'kitchen' | 'bedroom' | 'master' | 'mamad' | 'bath' | 'toilet'
  | 'corridor' | 'entry' | 'storage' | 'balcony' | 'laundry' | 'stairs' | 'other';

export const ROOM_TYPES: Record<RoomType, { label: string; color: string; wet?: boolean }> = {
  salon: { label: 'סלון', color: '#f2c94c' },
  kitchen: { label: 'מטבח', color: '#f2994a', wet: true },
  bedroom: { label: 'חדר שינה', color: '#6fcf97' },
  master: { label: 'חדר שינה הורים', color: '#27ae60' },
  mamad: { label: 'ממ"ד', color: '#9b8cf0' },
  bath: { label: 'חדר רחצה', color: '#56ccf2', wet: true },
  toilet: { label: 'שירותים', color: '#2d9cdb', wet: true },
  corridor: { label: 'מסדרון', color: '#bdbdbd' },
  entry: { label: 'מבואה / כניסה', color: '#d7a98c' },
  storage: { label: 'מחסן / חדר שירות', color: '#a1887f' },
  balcony: { label: 'מרפסת', color: '#9be15d' },
  laundry: { label: 'חדר כביסה', color: '#81d4fa', wet: true },
  stairs: { label: 'חדר מדרגות / מעלית', color: '#90a4ae' },
  other: { label: 'אחר', color: '#cfd8dc' },
};

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  unitId: number | null;
  polygon: Pt[];
  note?: string;
}

export type OpeningType = 'door' | 'entrance' | 'window' | 'sliding' | 'other';
export const OPENING_TYPES: Record<OpeningType, string> = {
  door: 'דלת פנים',
  entrance: 'דלת כניסה',
  window: 'חלון',
  sliding: 'דלת הזזה / מרפסת',
  other: 'פתח אחר',
};

export interface Opening {
  id: string;
  type: OpeningType;
  x: number; // מרכז, מנורמל
  y: number;
  wM: number; // רוחב במטרים
  hM?: number; // גובה במטרים
  sillM?: number; // גובה אדן (חלונות)
  room?: string; // id של חלל
  tag?: string; // סימון בתוכנית, למשל ד1 / ח3
  assumed?: boolean; // המידות הוערכו ולא נקראו מהתוכנית
}

export interface Fixture {
  id: string;
  kind: string; // מפתח מתוך FIXTURE_KINDS
  x: number;
  y: number;
  room?: string;
  unitId?: number | null;
  note?: string;
}

export const FIXTURE_KINDS: Record<string, { label: string; disc: 'electrical' | 'plumbing'; icon: string }> = {
  socket: { label: 'שקע חשמל', disc: 'electrical', icon: '⏚' },
  socket_dbl: { label: 'שקע כפול', disc: 'electrical', icon: '⏚⏚' },
  switch: { label: 'מפסק תאורה', disc: 'electrical', icon: 'S' },
  light: { label: 'נקודת תאורה', disc: 'electrical', icon: '✱' },
  panel: { label: 'לוח חשמל', disc: 'electrical', icon: '▣' },
  data: { label: 'נקודת תקשורת', disc: 'electrical', icon: 'D' },
  tv: { label: 'נקודת טלוויזיה', disc: 'electrical', icon: 'TV' },
  ac: { label: 'נקודת מזגן', disc: 'electrical', icon: 'AC' },
  intercom: { label: 'אינטרקום', disc: 'electrical', icon: 'IC' },
  toilet: { label: 'אסלה', disc: 'plumbing', icon: '◖' },
  sink: { label: 'כיור רחצה', disc: 'plumbing', icon: '◡' },
  shower: { label: 'מקלחון', disc: 'plumbing', icon: '▨' },
  bathtub: { label: 'אמבטיה', disc: 'plumbing', icon: '▭' },
  kitchen_sink: { label: 'כיור מטבח', disc: 'plumbing', icon: '▤' },
  washer: { label: 'נקודת מכונת כביסה', disc: 'plumbing', icon: 'W' },
  dishwasher: { label: 'נקודת מדיח', disc: 'plumbing', icon: 'MD' },
  boiler: { label: 'דוד / מחמם מים', disc: 'plumbing', icon: 'B' },
  drain: { label: 'נקודת ניקוז רצפה', disc: 'plumbing', icon: '⊗' },
  tap: { label: 'ברז גן / מרפסת', disc: 'plumbing', icon: 'T' },
};

export interface Element {
  id: string;
  type: 'column' | 'beam' | 'shearwall';
  polygon: Pt[];
}

export interface Analysis {
  version: 1;
  source: 'seed' | 'ai' | 'manual';
  summary?: string;
  scaleNote?: string;
  rooms: Room[];
  openings: Opening[];
  fixtures: Fixture[];
  elements?: Element[];
  warnings?: string[];
}

export type Discipline = 'architecture' | 'electrical' | 'plumbing' | 'structure' | 'hvac' | 'other';
export const DISCIPLINES: Record<Discipline, string> = {
  architecture: 'אדריכלות',
  electrical: 'חשמל',
  plumbing: 'אינסטלציה',
  structure: 'קונסטרוקציה',
  hvac: 'מיזוג אוויר',
  other: 'אחר',
};
export type PlanKind = 'plan' | 'section' | 'elevation' | 'detail';
export const PLAN_KINDS: Record<PlanKind, string> = {
  plan: 'תכנית קומה',
  section: 'חתך',
  elevation: 'חזית',
  detail: 'פרט',
};

export interface PlanMeta {
  id: number;
  project_id: number;
  floor_id: number | null;
  name: string;
  discipline: Discipline;
  kind: PlanKind;
  mime: string;
  width: number;
  height: number;
  paper_width_mm: number | null;
  scale_ratio: number | null;
  mpp: number | null;
  scale_source: string | null;
  analysis: Analysis | null;
  analyzed_at: string | null;
  filename?: string | null;
}

export interface Floor { id: number; project_id: number; name: string; sort: number }
export interface Unit { id: number; project_id: number; floor_id: number | null; name: string }
export interface Project { id: number; name: string; address: string | null; description: string | null; created_at: string }

export interface ProjectData {
  project: Project;
  floors: Floor[];
  units: Unit[];
  plans: PlanMeta[];
}
