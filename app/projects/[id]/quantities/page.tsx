'use client';
import { useMemo, useState } from 'react';
import Help from '@/components/Help';
import { useProject } from '@/components/ProjectProvider';
import { downloadCsv, fixtureRows, fixtureTable, openingRows, openingSchedule, roomRows, summarize } from '@/lib/quantities';
import { fmt } from '@/lib/geometry';
import { ROOM_TYPES } from '@/lib/types';

type Tab = 'rooms' | 'openings' | 'electrical' | 'plumbing' | 'finishes';

export default function Quantities() {
  const { data, floorId, unitId } = useProject();
  const [tab, setTab] = useState<Tab>('rooms');
  const [groupBy, setGroupBy] = useState<'room' | 'unit'>('unit');
  const [wallH, setWallH] = useState(2.5);
  const scope = { floorId, unitId };
  const scopeName = `${data.floors.find((f) => f.id === floorId)?.name ?? 'כל הקומות'} / ${data.units.find((u) => u.id === unitId)?.name ?? 'כל הדירות'}`;

  const rooms = useMemo(() => roomRows(data, scope), [data, floorId, unitId]); // eslint-disable-line
  const ops = useMemo(() => openingRows(data, scope), [data, floorId, unitId]); // eslint-disable-line
  const sched = useMemo(() => openingSchedule(ops), [ops]);
  const el = useMemo(() => fixtureTable(fixtureRows(data, 'electrical', scope), groupBy), [data, floorId, unitId, groupBy]); // eslint-disable-line
  const pl = useMemo(() => fixtureTable(fixtureRows(data, 'plumbing', scope), groupBy), [data, floorId, unitId, groupBy]); // eslint-disable-line
  const sum = useMemo(() => summarize(data, scope, wallH), [data, floorId, unitId, wallH]); // eslint-disable-line

  const fixtureTbl = (t: typeof el, name: string) => (
    t.table.length === 0 ? <div className="banner warn">אין נתונים. נתחו תחילה את תכנית ה{name === 'electrical' ? 'חשמל' : 'אינסטלציה'} במסך "תכנית וחללים".</div> : (
      <>
        <div className="tblwrap"><table className="tbl">
          <thead><tr><th>אביזר</th>{t.cols.map((c) => <th key={c} className="num">{c}</th>)}<th className="num">סה"כ</th></tr></thead>
          <tbody>{t.table.map((r) => <tr key={r.kind}><td>{r.label}</td>{t.cols.map((c) => <td key={c} className="num">{r.counts[c] || ''}</td>)}<td className="num"><b>{r.total}</b></td></tr>)}</tbody>
          <tfoot><tr><td>סה"כ</td>{t.cols.map((c) => <td key={c} className="num">{t.table.reduce((a, r) => a + (r.counts[c] || 0), 0)}</td>)}<td className="num">{t.table.reduce((a, r) => a + r.total, 0)}</td></tr></tfoot>
        </table></div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sm" onClick={() => downloadCsv(`${name}-${data.project.name}.csv`, ['אביזר', ...t.cols, 'סה"כ'], t.table.map((r) => [r.label, ...t.cols.map((c) => r.counts[c] || 0), r.total]))}>⬇ ייצוא ל-Excel (CSV)</button>
        </div>
      </>
    )
  );

  // כמויות גמרים משוערות
  const wetArea = rooms.filter((r) => ROOM_TYPES[r.type as keyof typeof ROOM_TYPES]?.wet).reduce((a, r) => a + r.areaM2, 0);
  const wallsByRoom = rooms.filter((r) => r.type !== 'stairs').map((r) => ({ ...r, wall: r.perimeterM * wallH }));

  return (
    <div className="page">
      <Help
        title="כתבי כמויות ונתונים למפרטים"
        intro="כל הכמויות מחושבות אוטומטית מהתכניות המנותחות (אדריכלות, חשמל, אינסטלציה) ולפי הקומה והדירה שנבחרו בסרגל העליון."
        items={[
          ['חללים ושטחים', 'טבלת כל החללים: ייעוד, שטח, מידות והיקף, עם סיכום לפי דירה.'],
          ['טבלת פתחים', 'דלתות, חלונות ודלתות הזזה מקובצים לפי סוג ומידה, עם סימוני התכנית, כמות ושטח. מידות שסומנו "הערכה" לא נקראו מהתכנית ויש לאמת אותן.'],
          ['חשמל / אינסטלציה', 'כמות כל סוג אביזר (שקעים, מפסקים, אסלות, כיורים…). אפשר לקבץ לפי דירה או לפי חלל.'],
          ['גמרים', 'שטחי ריצוף, חיפוי קירות משוער (היקף × גובה קיר שהוזן) וקירות רטובים – בסיס לכתב כמויות גמרים.'],
          ['ייצוא CSV', 'מוריד קובץ שנפתח ישירות ב-Excel בעברית.'],
          ['גובה קיר', 'משפיע על חישוב שטחי הקירות במסך "גמרים" (ברירת מחדל 2.5 מ\').'],
        ]}
      />
      <div className="row" style={{ marginBottom: 10 }}>
        <h1 className="grow" style={{ margin: 0 }}>כתבי כמויות</h1>
        <span className="chip">היקף: {scopeName}</span>
      </div>

      <div className="kpis" style={{ marginBottom: 14 }}>
        <div className="kpi"><b>{fmt(sum.totalAreaM2, 1)}</b><span>מ"ר שטח נטו</span></div>
        <div className="kpi"><b>{sum.doors}</b><span>דלתות</span></div>
        <div className="kpi"><b>{sum.windows}</b><span>חלונות / הזזה</span></div>
        <div className="kpi"><b>{sum.sockets}</b><span>שקעי חשמל</span></div>
        <div className="kpi"><b>{sum.electricalPoints}</b><span>נקודות חשמל</span></div>
        <div className="kpi"><b>{sum.plumbingPoints}</b><span>אביזרי אינסטלציה</span></div>
      </div>

      <div className="seg" style={{ marginBottom: 12 }}>
        {([['rooms', 'חללים ושטחים'], ['openings', 'טבלת פתחים'], ['electrical', 'חשמל'], ['plumbing', 'אינסטלציה'], ['finishes', 'גמרים']] as [Tab, string][]).map(([k, t]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>
        ))}
      </div>

      <div className="card">
        {tab === 'rooms' && (rooms.length === 0 ? <div className="banner warn">אין חללים מנותחים בהיקף שנבחר.</div> : (
          <>
            <div className="tblwrap"><table className="tbl">
              <thead><tr><th>דירה</th><th>חלל</th><th>ייעוד</th><th className="num">שטח (מ"ר)</th><th className="num">אורך (מ')</th><th className="num">רוחב (מ')</th><th className="num">היקף (מ')</th></tr></thead>
              <tbody>{rooms.map((r) => <tr key={r.planId + r.roomId}><td>{r.unitName}</td><td>{r.name}</td><td>{r.typeLabel}</td><td className="num">{fmt(r.areaM2)}</td><td className="num">{fmt(r.lengthM)}</td><td className="num">{fmt(r.widthM)}</td><td className="num">{fmt(r.perimeterM)}</td></tr>)}</tbody>
              <tfoot><tr><td colSpan={3}>סה"כ</td><td className="num">{fmt(rooms.reduce((a, r) => a + r.areaM2, 0))}</td><td colSpan={3} /></tr></tfoot>
            </table></div>
            <h3 style={{ marginTop: 16 }}>סיכום לפי דירה</h3>
            <table className="tbl"><thead><tr><th>דירה</th><th className="num">שטח (מ"ר)</th><th className="num">מס' חללים</th></tr></thead>
              <tbody>{[...new Set(rooms.map((r) => r.unitName))].map((u) => <tr key={u}><td>{u}</td><td className="num">{fmt(rooms.filter((r) => r.unitName === u).reduce((a, r) => a + r.areaM2, 0))}</td><td className="num">{rooms.filter((r) => r.unitName === u).length}</td></tr>)}</tbody></table>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn sm" onClick={() => downloadCsv(`חללים-${data.project.name}.csv`, ['דירה', 'חלל', 'ייעוד', 'שטח מ"ר', 'אורך', 'רוחב', 'היקף'], rooms.map((r) => [r.unitName, r.name, r.typeLabel, r.areaM2.toFixed(2), r.lengthM.toFixed(2), r.widthM.toFixed(2), r.perimeterM.toFixed(2)]))}>⬇ ייצוא ל-Excel (CSV)</button>
            </div>
          </>
        ))}

        {tab === 'openings' && (sched.length === 0 ? <div className="banner warn">אין פתחים מנותחים בהיקף שנבחר.</div> : (
          <>
            <h3>טבלת פתחים מסוכמת</h3>
            <div className="tblwrap"><table className="tbl">
              <thead><tr><th>סוג</th><th>סימון</th><th className="num">רוחב (מ')</th><th className="num">גובה (מ')</th><th className="num">אדן (מ')</th><th className="num">כמות</th><th className="num">שטח כולל (מ"ר)</th><th>הערה</th></tr></thead>
              <tbody>{sched.map((g) => <tr key={g.key}><td>{g.typeLabel}</td><td>{g.tags.join(', ') || '—'}</td><td className="num">{fmt(g.widthM)}</td><td className="num">{g.heightM ? fmt(g.heightM) : '—'}</td><td className="num">{g.sillM ? fmt(g.sillM) : '—'}</td><td className="num"><b>{g.count}</b></td><td className="num">{fmt(g.areaM2)}</td><td>{g.assumed ? <span className="chip warn">הערכה</span> : ''}</td></tr>)}</tbody>
              <tfoot><tr><td colSpan={5}>סה"כ</td><td className="num">{sched.reduce((a, g) => a + g.count, 0)}</td><td className="num">{fmt(sched.reduce((a, g) => a + g.areaM2, 0))}</td><td /></tr></tfoot>
            </table></div>
            <h3 style={{ marginTop: 16 }}>פירוט לפי חלל</h3>
            <div className="tblwrap"><table className="tbl">
              <thead><tr><th>דירה</th><th>חלל</th><th>סוג</th><th>סימון</th><th className="num">רוחב</th><th className="num">גובה</th></tr></thead>
              <tbody>{ops.map((o) => <tr key={o.planId + o.opening.id}><td>{o.unitName}</td><td>{o.roomName}</td><td>{o.opening.type === 'window' ? 'חלון' : o.opening.type === 'sliding' ? 'הזזה' : o.opening.type === 'entrance' ? 'כניסה' : 'דלת'}</td><td>{o.opening.tag || '—'}</td><td className="num">{fmt(o.opening.wM)}</td><td className="num">{o.opening.hM ? fmt(o.opening.hM) : '—'}</td></tr>)}</tbody>
            </table></div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn sm" onClick={() => downloadCsv(`פתחים-${data.project.name}.csv`, ['סוג', 'סימון', 'רוחב', 'גובה', 'אדן', 'כמות', 'שטח כולל'], sched.map((g) => [g.typeLabel, g.tags.join(' '), g.widthM.toFixed(2), g.heightM?.toFixed(2) ?? '', g.sillM?.toFixed(2) ?? '', g.count, g.areaM2.toFixed(2)]))}>⬇ ייצוא טבלת פתחים (CSV)</button>
            </div>
          </>
        ))}

        {(tab === 'electrical' || tab === 'plumbing') && (
          <>
            <div className="row" style={{ marginBottom: 10 }}>
              <span className="small muted">קיבוץ לפי:</span>
              <div className="seg"><button className={groupBy === 'unit' ? 'on' : ''} onClick={() => setGroupBy('unit')}>דירה</button><button className={groupBy === 'room' ? 'on' : ''} onClick={() => setGroupBy('room')}>חלל</button></div>
            </div>
            {tab === 'electrical' ? fixtureTbl(el, 'electrical') : fixtureTbl(pl, 'plumbing')}
          </>
        )}

        {tab === 'finishes' && (
          <>
            <div className="row" style={{ marginBottom: 10 }}>
              <label className="row small">גובה קיר (מ'): <input type="number" step="0.05" value={wallH} onChange={(e) => setWallH(Number(e.target.value) || 2.5)} style={{ width: 90 }} /></label>
            </div>
            <div className="kpis" style={{ marginBottom: 12 }}>
              <div className="kpi"><b>{fmt(sum.totalAreaM2, 1)}</b><span>ריצוף כולל (מ"ר, ללא חדר מדרגות)</span></div>
              <div className="kpi"><b>{fmt(wetArea, 1)}</b><span>מ"ר חללים רטובים</span></div>
              <div className="kpi"><b>{fmt(sum.wallAreaGrossM2, 1)}</b><span>קירות ברוטו (מ"ר)</span></div>
              <div className="kpi"><b>{fmt(sum.openingsAreaM2, 1)}</b><span>פתחים (מ"ר) לניכוי</span></div>
              <div className="kpi"><b>{fmt(Math.max(0, sum.wallAreaGrossM2 - sum.openingsAreaM2), 1)}</b><span>קירות נטו משוער (מ"ר)</span></div>
            </div>
            <div className="tblwrap"><table className="tbl">
              <thead><tr><th>דירה</th><th>חלל</th><th className="num">ריצוף (מ"ר)</th><th className="num">היקף (מ')</th><th className="num">קירות ברוטו (מ"ר)</th></tr></thead>
              <tbody>{wallsByRoom.map((r) => <tr key={r.planId + r.roomId}><td>{r.unitName}</td><td>{r.name}</td><td className="num">{fmt(r.areaM2)}</td><td className="num">{fmt(r.perimeterM)}</td><td className="num">{fmt(r.wall)}</td></tr>)}</tbody>
            </table></div>
            <p className="muted small" style={{ marginTop: 8 }}>הערכה בלבד: אינה כוללת פחת, עובי קירות, ארונות או גובה תקרה שונה בין חללים.</p>
            <button className="btn sm" style={{ marginTop: 8 }} onClick={() => downloadCsv(`גמרים-${data.project.name}.csv`, ['דירה', 'חלל', 'ריצוף מ"ר', 'היקף', 'קירות ברוטו'], wallsByRoom.map((r) => [r.unitName, r.name, r.areaM2.toFixed(2), r.perimeterM.toFixed(2), r.wall.toFixed(2)]))}>⬇ ייצוא ל-Excel (CSV)</button>
          </>
        )}
      </div>
    </div>
  );
}
