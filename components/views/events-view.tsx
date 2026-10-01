import { useApp } from '@/components/app-context';
import { byDate, categoryLabel } from '@/components/format';
import { ResponseButtons } from '@/components/shared/response-buttons';

export function EventsView() {
  const { events, go } = useApp();
  return <div className="page">
    <div className="page-head"><h1>Arrangementer</h1><p className="muted">Kurs, samlinger og møter for elevråd</p></div>
    {[...events].sort(byDate).map(e=><article className="event-card" key={e.id}>
      <button className="event-visual" onClick={()=>go({ view:'event', id:e.id })} aria-label={`Åpne ${e.title}`}>
        {e.imageAlt&&<span className="media-label">{e.imageAlt}</span>}
        <span className="event-badge">{categoryLabel[e.category]}</span>
      </button>
      <div className="event-body">
        <p className="event-date">{e.start}</p>
        <h2 className="event-title">{e.title}</h2>
        <p className="event-meta">{e.host} · {e.place}</p>
        <p className="event-desc">{e.summary}</p>
        <div className="event-buttons"><ResponseButtons event={e}/><button className="quiet" onClick={()=>go({ view:'event', id:e.id })}>Detaljer</button></div>
      </div>
    </article>)}
  </div>;
}
