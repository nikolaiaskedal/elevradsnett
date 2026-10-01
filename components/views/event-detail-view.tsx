import { useApp } from '@/components/app-context';
import { eventFacts, formatNumber, kindLabel } from '@/components/format';
import { NotFound } from '@/components/shared/not-found';
import { ResponseButtons } from '@/components/shared/response-buttons';
import { Avatar } from '@/components/shared/ui';

export function EventDetailView({id}:{id:string}) {
  const { events, org, go, responses } = useApp();
  const e = events.find(x=>x.id===id);
  if (!e) return <NotFound/>;
  const host = org(e.hostId);
  const going = e.registered+(responses[e.id]==='going'?1:0);
  const interested = e.interested+(responses[e.id]==='interested'?1:0);
  return <div className="page" style={{ gap:16 }}>
    <button className="back-btn" onClick={()=>go({ view:'events' })}>← Alle arrangementer</button>
    <div className="detail">
      <div className="hero-ph">{e.imageAlt&&<span className="media-label">{e.imageAlt}</span>}</div>
      <div className="detail-body">
        <p className="event-date">{e.start}</p>
        <h1>{e.title}</h1>
        <div className="facts">{eventFacts(e).map(f=><div className="fact" key={f.label}><p className="label">{f.label}</p><p className="value">{f.value}</p></div>)}</div>
        <p className="detail-long">{e.description}</p>
        <div className="actions" style={{ marginTop:22 }}><ResponseButtons event={e} large/></div>
        <p className="muted" style={{ marginTop:14 }}>{formatNumber(going)} elevråd har meldt at de skal · {formatNumber(interested)} er interessert</p>
        {host&&<div className="detail-section">
          <h2>Arrangør</h2>
          <div className="host-row">
            <Avatar initials={host.initials} tone="coral" size="lg"/>
            <div><button className="name-link" onClick={()=>go({ view:'organization', id:host.id })}>{host.name}</button><p className="sub">{kindLabel[host.type]}{host.type!=='school'?' · verifisert':''}</p></div>
          </div>
        </div>}
      </div>
    </div>
  </div>;
}
