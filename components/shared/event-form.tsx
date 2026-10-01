import { useState } from 'react';
import { categoryLabel } from '@/components/format';
import { useService } from '@/components/service-provider';
import { Modal } from '@/components/shared/ui';
import { eventAudienceLabel } from '@/lib/domain/events';
import { kindLabel } from '@/lib/domain/labels';
import type { Event, EventAudience, EventCategory, EventOrganizer } from '@/lib/domain/types';
import { errorMessage, EVENT_CATEGORIES, EVENT_DESCRIPTION_MAX_LENGTH, EVENT_SUMMARY_MAX_LENGTH, EVENT_TITLE_MAX_LENGTH, type EventInput } from '@/lib/domain/validation';

/** «2026-10-11T12:00» i nettleserens tidssone, slik datetime-local vil ha det. */
function toLocalInput(iso?:string) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n:number)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (value:string)=>value?new Date(value).toISOString():undefined;
const toNumber = (value:string)=>value.trim()?Number(value):undefined;

type Draft = { organizerId:string; title:string; summary:string; description:string; category:EventCategory; startsAt:string; endsAt:string; location:string; digitalUrl:string;
  registrationDeadline:string; capacity:string; seatsPerOrganization:string; price:string; audience:EventAudience };

function draftOf(event:Event|undefined,organizers:EventOrganizer[]):Draft {
  return {
    organizerId:event?.hostId ?? organizers[0]?.id ?? '', title:event?.title ?? '', summary:event?.summary ?? '', description:event?.description ?? '',
    category:event?.category ?? 'kurs', startsAt:toLocalInput(event?.startsAt), endsAt:toLocalInput(event?.endsAt), location:event?.location ?? '',
    digitalUrl:event?.digitalUrl ?? '', registrationDeadline:toLocalInput(event?.deadlineAt), capacity:event?.capacity?String(event.capacity):'',
    seatsPerOrganization:event?.seatsPerOrganization?String(event.seatsPerOrganization):'', price:event?.price ?? '',
    audience:event?.audienceCode ?? (organizers[0]?.type==='national'?'public':'county'),
  };
}

/**
 * Opprette eller endre et arrangement (§8). Arrangørene er dem serveren sier brukeren kan arrangere for.
 * Et publisert arrangement kan ikke bli utkast igjen; avlysning og avslutning gjøres på arrangementsiden.
 */
export function EventForm({open,event,organizers,onClose,onSaved}:{open:boolean;event?:Event;organizers:EventOrganizer[];onClose:()=>void;onSaved:(id:string,published:boolean)=>void}) {
  const service = useService();
  const [draft,setDraft] = useState<Draft>(()=>draftOf(event,organizers));
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const set = <K extends keyof Draft>(key:K,value:Draft[K])=>setDraft(d=>({ ...d, [key]:value }));
  const save = async(status:'draft'|'published')=>{
    setBusy(true); setError('');
    const input:EventInput = {
      id:event?.id, organizerId:draft.organizerId, title:draft.title, summary:draft.summary, description:draft.description, category:draft.category,
      startsAt:fromLocalInput(draft.startsAt) ?? '', endsAt:fromLocalInput(draft.endsAt) ?? '', location:draft.location, digitalUrl:draft.digitalUrl,
      registrationDeadline:fromLocalInput(draft.registrationDeadline), capacity:toNumber(draft.capacity), seatsPerOrganization:toNumber(draft.seatsPerOrganization),
      price:draft.price, audience:draft.audience, status,
    };
    try { const id = await service.saveEvent(input); onSaved(id,status==='published'); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const published = event?.status==='published';
  return <Modal open={open} onClose={onClose} labelledBy="event-form-title" width={640}>
    <div className="modal-head"><h2 id="event-form-title">{event?'Rediger arrangement':'Nytt arrangement'}</h2><button className="close-btn" aria-label="Lukk" onClick={onClose}>×</button></div>
    <form className="modal-body event-form" onSubmit={e=>{ e.preventDefault(); void save('published'); }}>
      <label className="field"><span>Arrangør</span>
        <select value={draft.organizerId} disabled={!!event} onChange={e=>set('organizerId',e.target.value)}>
          {event?<option value={event.hostId}>{event.host}</option>
            :organizers.map(o=><option key={o.id} value={o.id}>{o.name}{o.type==='national'?'':` · ${kindLabel[o.type]}`}</option>)}
        </select>
        {event&&<small>Arrangøren kan ikke endres.</small>}
      </label>
      <label className="field"><span>Tittel</span><input value={draft.title} onChange={e=>set('title',e.target.value)} maxLength={EVENT_TITLE_MAX_LENGTH} required/></label>
      <label className="field"><span>Ingress (valgfritt)</span><input value={draft.summary} onChange={e=>set('summary',e.target.value)} maxLength={EVENT_SUMMARY_MAX_LENGTH} placeholder="Én setning som vises i listen"/></label>
      <label className="field"><span>Beskrivelse</span><textarea className="input" rows={5} value={draft.description} onChange={e=>set('description',e.target.value)} maxLength={EVENT_DESCRIPTION_MAX_LENGTH} required/></label>
      <div className="form-grid">
        <label className="field"><span>Type</span><select value={draft.category} onChange={e=>set('category',e.target.value as EventCategory)}>{EVENT_CATEGORIES.map(c=><option key={c} value={c}>{categoryLabel[c]}</option>)}</select></label>
        <label className="field"><span>Målgruppe</span><select value={draft.audience} onChange={e=>set('audience',e.target.value as EventAudience)}>{(Object.keys(eventAudienceLabel) as EventAudience[]).map(a=><option key={a} value={a}>{eventAudienceLabel[a]}</option>)}</select></label>
        <label className="field"><span>Starter</span><input type="datetime-local" value={draft.startsAt} onChange={e=>set('startsAt',e.target.value)} required/></label>
        <label className="field"><span>Slutter</span><input type="datetime-local" value={draft.endsAt} min={draft.startsAt} onChange={e=>set('endsAt',e.target.value)} required/></label>
        <label className="field"><span>Sted</span><input value={draft.location} onChange={e=>set('location',e.target.value)} maxLength={200} placeholder="F.eks. Sundvolden"/></label>
        <label className="field"><span>Lenke til digitalt møte</span><input type="url" value={draft.digitalUrl} onChange={e=>set('digitalUrl',e.target.value)} maxLength={500} placeholder="https://"/>
          <small>Vises bare for påmeldte og delegater.</small></label>
        <label className="field"><span>Påmeldingsfrist (valgfritt)</span><input type="datetime-local" value={draft.registrationDeadline} max={draft.startsAt} onChange={e=>set('registrationDeadline',e.target.value)}/></label>
        <label className="field"><span>Pris (valgfritt)</span><input value={draft.price} onChange={e=>set('price',e.target.value)} maxLength={60} placeholder="F.eks. Gratis"/></label>
        <label className="field"><span>Kapasitet (organisasjoner)</span><input type="number" inputMode="numeric" min={1} value={draft.capacity} onChange={e=>set('capacity',e.target.value)} placeholder="Ubegrenset"/>
          <small>Når det er fullt, havner nye påmeldinger på venteliste.</small></label>
        <label className="field"><span>Plasser per organisasjon</span><input type="number" inputMode="numeric" min={1} max={50} value={draft.seatsPerOrganization} onChange={e=>set('seatsPerOrganization',e.target.value)} placeholder="Ubegrenset"/>
          <small>Hvor mange delegater hver organisasjon kan melde på.</small></label>
      </div>
      {error&&<p className="form-error" role="alert">{error}</p>}
    </form>
    <div className="modal-foot">
      <button className="btn" onClick={onClose}>Avbryt</button>
      {!published&&<button className="btn" disabled={busy} onClick={()=>void save('draft')}>Lagre som utkast</button>}
      <button className="btn primary lifted" disabled={busy} onClick={()=>void save('published')}>{published?'Lagre endringer':'Publiser'}</button>
    </div>
  </Modal>;
}
