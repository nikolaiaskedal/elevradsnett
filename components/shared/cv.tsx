import { useApp } from '@/components/app-context';
import { categoryLabel } from '@/components/format';
import { formatDate } from '@/lib/domain/time';
import type { CvEvent, OrganizationCvEntry, PersonCv } from '@/lib/domain/types';

const monthYear = (iso:string)=>new Date(iso).toLocaleDateString('nb-NO',{ month:'long', year:'numeric' });
const year = (iso:string)=>new Date(iso).getFullYear();

/** Én stjerne per bekreftet deltakelse på Elevtinget (§8). */
export function Stars({count}:{count:number}) {
  if (!count) return null;
  return <span className="stars" role="img" aria-label={`${count} ${count===1?'stjerne':'stjerner'} for Elevtinget`}>{'★'.repeat(Math.min(count,10))}</span>;
}

/** Personens CV: offentlige verv og arrangementer med bekreftet oppmøte. Interne rettigheter vises aldri. */
export function PersonCvSections({cv,showOffices = true}:{cv:PersonCv;showOffices?:boolean}) {
  const { go } = useApp();
  return <>
    {showOffices&&<section className="section-card">
      <h2>Verv</h2>
      {cv.offices.length?<ul className="history-list">{cv.offices.map(o=><li key={o.id}>
        <strong>{o.title}</strong>
        <span className="sub"><button className="name-link" onClick={()=>go({ view:'organization', id:o.organizationId })}>{o.organizationName}</button> · {monthYear(o.startDate)} – {o.active||!o.endDate?'nå':monthYear(o.endDate)}</span>
      </li>)}</ul>:<p className="muted">Ingen offentlige verv.</p>}
    </section>}
    <section className="section-card">
      <div className="card-head"><h2>Arrangementer</h2><Stars count={cv.stars}/></div>
      {cv.events.length?<ul className="history-list">{cv.events.map(e=><CvEventItem key={`${e.eventId}-${e.organizationId}`} event={e}/>)}</ul>
        :<p className="muted" style={{ lineHeight:1.5 }}>Ingen bekreftede arrangementer ennå. Et arrangement kommer på CV-en når arrangøren har bekreftet oppmøtet.</p>}
    </section>
  </>;
}

function CvEventItem({event:e}:{event:CvEvent}) {
  const { go } = useApp();
  return <li>
    <strong><button className="name-link" onClick={()=>go({ view:'event', id:e.eventId })}>{e.title}</button>{e.elevtinget&&<span className="stars" aria-label="Elevtinget"> ★</span>}</strong>
    <span className="sub">{formatDate(e.startsAt)} · {categoryLabel[e.category]} · for {e.organizationName}{e.officeTitle?` som ${e.officeTitle.toLowerCase()}`:''}</span>
  </li>;
}

/** Skolens CV: arrangementer skolen har deltatt på, hvem som representerte den, årstall og verv. */
export function OrganizationCvSection({entries}:{entries:OrganizationCvEntry[]}) {
  const { go } = useApp();
  if (!entries.length) return null;
  const byEvent = new Map<string,OrganizationCvEntry[]>();
  for (const entry of entries) byEvent.set(entry.eventId,[...(byEvent.get(entry.eventId) ?? []),entry]);
  return <section className="section-card">
    <h2>Deltakelse på arrangementer</h2>
    <ul className="history-list">{[...byEvent.values()].map(rows=>{ const e = rows[0]; return <li key={e.eventId}>
      <strong><button className="name-link" onClick={()=>go({ view:'event', id:e.eventId })}>{e.title}</button> · {year(e.startsAt)}{e.elevtinget&&<span className="stars" aria-label="Elevtinget"> ★</span>}</strong>
      <span className="sub">{e.organizerName} · {categoryLabel[e.category]}</span>
      <span className="sub">{rows.map((r,i)=><span key={`${r.userId ?? 'x'}-${i}`}>{i>0?', ':''}{r.userId
        ?<button className="name-link" onClick={()=>go({ view:'person', id:r.userId! })}>{r.name}</button>:r.name}{r.officeTitle?` (${r.officeTitle.toLowerCase()})`:''}</span>)}</span>
    </li>; })}</ul>
  </section>;
}
