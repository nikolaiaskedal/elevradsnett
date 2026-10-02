import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/app-context';
import { useService } from '@/components/service-provider';
import { byDate, contactLabel, formatNumber, initialsOf, orgLine } from '@/components/format';
import { OrganizationCvSection } from '@/components/shared/cv';
import { EventMini } from '@/components/shared/event-mini';
import { NotFound } from '@/components/shared/not-found';
import { PostCard } from '@/components/shared/post-card';
import { prepareAvatar, prepareEventImage } from '@/components/shared/image';
import { Avatar, ConfirmButton, Status, usesEoAvatar } from '@/components/shared/ui';
import { isPastEvent } from '@/lib/domain/events';
import type { ImageSource, Organization, OrganizationCvEntry, OrganizationImages, PublicOfficer } from '@/lib/domain/types';
import { errorMessage } from '@/lib/domain/validation';

/** Om bildet er eget eller arvet (§14). */
const imageSourceLabel:Record<ImageSource,string> = { own:'Eget bilde', local_board:'Arvet fra lokallaget', county:'Arvet fra fylket', global:'Standard fra EO', none:'Ingen bilde' };

export function OrganizationView({id,onContact}:{id:string;onContact:(o:Organization)=>void}) {
  const service = useService();
  const { events, org, posts, activeRep, openComposer, loadOrganizationPosts, notify } = useApp();
  const [officers,setOfficers] = useState<{ id:string; list:PublicOfficer[] }|null>(null);
  const [cv,setCv] = useState<{ id:string; list:OrganizationCvEntry[] }|null>(null);
  const [images,setImages] = useState<{ id:string; images:OrganizationImages }|null>(null);
  const [imageBusy,setImageBusy] = useState<'profile'|'cover'|null>(null);
  // Deaktiverte organisasjoner er ikke i listen, men siden skal fortsatt kunne åpnes fra gamle innlegg og lenker.
  const [fetched,setFetched] = useState<{ id:string; org:Organization|null }|null>(null);
  const listed = org(id);
  useEffect(()=>{
    if (listed) return;
    let cancelled = false;
    service.getOrganization(id).then(found=>{ if (!cancelled) setFetched({ id, org:found }); }).catch(()=>{ if (!cancelled) setFetched({ id, org:null }); });
    return ()=>{ cancelled = true; };
  },[id,listed,service]);
  const o = listed ?? (fetched?.id===id?fetched.org ?? undefined:undefined);
  // Innleggene og tillitsvalgte hentes for siden, så de vises også når de ikke er i feeden.
  // loadOrganizationPosts er ny ved hver oppdatering av appen, så den leses fra en ref: det holder å hente når siden byttes.
  const loadPosts = useRef(loadOrganizationPosts);
  useEffect(()=>{ loadPosts.current = loadOrganizationPosts; });
  const exists = !!o;
  useEffect(()=>{
    if (!exists) return;
    let cancelled = false;
    loadPosts.current(id);
    service.listPublicOfficers(id).then(list=>{ if (!cancelled) setOfficers({ id, list }); }).catch(()=>{});
    service.getOrganizationCv(id).then(list=>{ if (!cancelled) setCv({ id, list }); }).catch(()=>{});
    return ()=>{ cancelled = true; };
  },[id,exists,service]);
  useEffect(()=>{
    if (!exists) return;
    let cancelled = false;
    service.getOrganizationImages(id).then(found=>{ if (!cancelled) setImages({ id, images:found }); }).catch(()=>{});
    return ()=>{ cancelled = true; };
  },[id,exists,service]);
  if (!o) return fetched?.id===id?<NotFound/>:<div className="page"><p className="muted">Henter …</p></div>;
  const pictures = images?.id===o.id?images.images:null;
  const changeImage = async(kind:'profile'|'cover',file:File|null)=>{
    setImageBusy(kind);
    try {
      const prepared = file?(kind==='profile'?await prepareAvatar(file):await prepareEventImage(file)):null;
      setImages({ id:o.id, images:await service.setOrganizationImage({ organizationId:o.id, kind, image:prepared }) });
      notify(file?(kind==='profile'?'Profilbildet er oppdatert':'Coverbildet er oppdatert'):'Bildet er fjernet');
    } catch (e) { notify(errorMessage(e)); } finally { setImageBusy(null); }
  };
  const inactive = o.status!=='active';
  const people = officers?.id===o.id?officers.list:o.officers ?? [];
  const own = posts.filter(p=>p.organizationId===o.id);
  const hosted = events.filter(e=>e.hostId===o.id && e.status!=='draft' && !isPastEvent(e)).sort(byDate);
  const stats:[number,string][] =
    o.type==='school'?[[o.studentCount ?? 0,'elever'],[o.followers,'følgere'],[own.length,'innlegg']]
    :o.type==='county_board'?[[o.memberCount ?? 0,'elevråd'],[people.length || (o.officerCount ?? 0),'i fylkesstyret'],[own.length,'innlegg']]
    :[[o.memberCount ?? 0,o.type==='national'?'medlemsråd':'elevråd'],[o.followers,'følgere'],[own.length,'innlegg']];
  const isActiveOrg = activeRep?.organizationId===o.id;
  return <div className="page">
    <div className="org-hero">
      <div className={`org-cover ${o.type} ${pictures?.coverUrl?'has-image':''}`}>{pictures?.coverUrl&&<img src={pictures.coverUrl} alt=""/>}</div>
      <div className="org-hero-body">
        <div className="org-identity">
          <span className={`org-avatar ${o.type==='national'?'coral':''} ${usesEoAvatar(o.type)&&!pictures?.profileUrl?'eo':''} ${pictures?.profileUrl?'has-image':''}`} aria-hidden="true">
            {pictures?.profileUrl?<img src={pictures.profileUrl} alt=""/>:usesEoAvatar(o.type)?<Avatar initials={o.initials} orgType={o.type} size="xl"/>:o.initials}
          </span>
          <div className="names"><h1>{o.name}</h1><p>{orgLine(o)}</p></div>
          {o.status!=='active'&&<Status tone="gray">Deaktivert</Status>}
        </div>
        {inactive&&<p className="warn-box">{o.type==='school'?'Elevrådet':'Organisasjonen'} er deaktivert. Innlegg, verv og arrangementer er bevart som historikk, men ingen kan publisere eller opptre på vegne av {o.name}.</p>}
        <p className="org-bio">{o.bio}</p>
        {!inactive&&<div className="org-actions">
          {isActiveOrg&&activeRep?.canPublish
            ?<button className="btn ghost large" onClick={openComposer}>Nytt innlegg som {o.name}</button>
            :<button className="btn ghost large" onClick={()=>onContact(o)}>{contactLabel(o)}</button>}
        </div>}
        {pictures?.canChange&&<div className="org-image-controls" aria-label="Bilder">
          {(['profile','cover'] as const).map(kind=>{
            const url = kind==='profile'?pictures.profileUrl:pictures.coverUrl;
            const source = kind==='profile'?pictures.profileSource:pictures.coverSource;
            const name = kind==='profile'?'profilbilde':'coverbilde';
            return <div className="org-image-control" key={kind}>
              <span className="grow"><strong>{kind==='profile'?'Profilbilde':'Coverbilde'}</strong><small>{imageSourceLabel[source]}</small></span>
              <label className={`btn small ${imageBusy?'disabled':''}`}>{imageBusy===kind?'Behandler …':source==='own'?`Bytt ${name}`:`Last opp ${name}`}
                <input type="file" accept="image/*" className="sr-only" disabled={!!imageBusy} onChange={e=>{ const f = e.target.files?.[0]; e.target.value=''; if (f) void changeImage(kind,f); }}/>
              </label>
              {source==='own'&&url&&<ConfirmButton label="Fjern" question={`Fjerne ${name}et?`} confirmLabel="Fjern" disabled={!!imageBusy} onConfirm={()=>void changeImage(kind,null)}/>}
            </div>;
          })}
        </div>}
        <div className="org-stats">{stats.map(([value,label])=><div key={label}><strong>{formatNumber(value)}</strong><span>{label}</span></div>)}</div>
      </div>
    </div>
    {!!o.priorities?.length&&<section className="section-card warm">
      <h2>{o.prioritiesTitle ?? 'Prioriterte saker'}</h2>
      <div className="list" style={{ gap:10 }}>{o.priorities.map((p,i)=><div className="priority-row" key={p.id}><span className="priority-num">{i+1}</span><div><strong>{p.title}</strong><p>{p.description}</p></div></div>)}</div>
    </section>}
    {!!people.length&&<section className="section-card">
      <h2>{o.officersTitle ?? 'Tillitsvalgte'}</h2>
      <div className="people-grid">{people.map(p=><div className="person" key={p.id}><Avatar tone="pale" initials={initialsOf(p.name)}/><div className="grow"><strong>{p.name}</strong><p className="sub">{p.publicTitle}</p></div></div>)}</div>
    </section>}
    {!!hosted.length&&<section className="section-card cool">
      <h2>Kommende arrangementer</h2>
      <div className="list" style={{ gap:10 }}>{hosted.map(e=><EventMini key={e.id} event={e} flat/>)}</div>
    </section>}
    {cv?.id===o.id&&<OrganizationCvSection entries={cv.list}/>}
    <section>
      <h2 className="section-title">{o.type==='school'?'Innlegg fra elevrådet':o.type==='national'?'Innlegg fra EO':o.type==='county_board'?'Innlegg fra fylkeslaget':'Innlegg fra lokallaget'}</h2>
      <div className="list" style={{ gap:16 }}>{own.map(p=><PostCard key={p.id} post={p} plain/>)}</div>
      {!own.length&&<p className="empty-note">Ingen innlegg ennå.</p>}
    </section>
  </div>;
}
