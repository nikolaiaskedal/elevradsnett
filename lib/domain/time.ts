// Norske tidsangivelser for data fra serveren. Delt mellom web, iOS og Android.

const MONTHS = ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'];
const TIME_ZONE = 'Europe/Oslo';

/** Dato og klokkeslett i norsk tid, uavhengig av tidssonen på enheten. */
function parts(iso:string) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{ timeZone:TIME_ZONE, year:'numeric', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit', hourCycle:'h23' })
    .formatToParts(new Date(iso)).map(p=>[p.type,p.value]));
  return { year:Number(values.year), month:Number(values.month), day:Number(values.day), time:`${values.hour}:${values.minute}` };
}

/** «12. mars 2027». */
export function formatDate(iso:string) {
  const p = parts(iso);
  return `${p.day}. ${MONTHS[p.month-1]} ${p.year}`;
}

/** «1. februar», uten år. */
export function formatDayMonth(iso:string) {
  const p = parts(iso);
  return `${p.day}. ${MONTHS[p.month-1]}`;
}

/** Hvor lenge siden, slik feeden viser det: «nå», «for 5 min siden», «for 3 t siden», «i går», ellers datoen. */
export function formatRelative(iso:string, now:Date = new Date()) {
  const minutes = Math.floor((now.getTime()-new Date(iso).getTime())/60000);
  if (minutes<1) return 'nå';
  if (minutes<60) return `for ${minutes} min siden`;
  if (minutes<24*60) return `for ${Math.floor(minutes/60)} t siden`;
  if (minutes<48*60) return 'i går';
  const p = parts(iso);
  return p.year===parts(now.toISOString()).year?`${p.day}. ${MONTHS[p.month-1]}`:formatDate(iso);
}

/** Start og slutt for et arrangement: «11.–12. oktober 2026» og tom slutt, eller dato og «kl. 17–20». */
export function formatEventSpan(startIso:string, endIso:string):{ start:string; end:string } {
  const s = parts(startIso), e = parts(endIso);
  if (s.year===e.year && s.month===e.month && s.day===e.day) {
    const hour = (t:string)=>t.endsWith(':00')?t.slice(0,2).replace(/^0/,''):t;
    return { start:formatDate(startIso), end:`kl. ${hour(s.time)}–${hour(e.time)}` };
  }
  if (s.year===e.year && s.month===e.month) return { start:`${s.day}.–${e.day}. ${MONTHS[s.month-1]} ${s.year}`, end:'' };
  if (s.year===e.year) return { start:`${s.day}. ${MONTHS[s.month-1]}–${e.day}. ${MONTHS[e.month-1]} ${s.year}`, end:'' };
  return { start:`${formatDate(startIso)}–${formatDate(endIso)}`, end:'' };
}
