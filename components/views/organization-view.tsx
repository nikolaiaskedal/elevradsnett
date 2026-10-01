import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/app-context';
import { useService } from '@/components/service-provider';
import { byDate, contactLabel, formatNumber, initialsOf, orgLine } from '@/components/format';
import { EventMini } from '@/components/shared/event-mini';
import { NotFound } from '@/components/shared/not-found';
import { PostCard } from '@/components/shared/post-card';
import { Avatar, Status } from '@/components/shared/ui';
import type { Organization, PublicOfficer } from '@/lib/domain/types';

export function OrganizationView({id,onContact}:{id:string;onContact:(o:Organization)=>void}) {
  const service = useService();
  const { events, org, posts, activeRep, openComposer, loadOrganizationPosts } = useApp();
  const [officers,setOfficers] = useState<{ id:string; list:PublicOfficer[] }|null>(null);
  const o = org(id);
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
    return ()=>{ cancelled = true; };
  },[id,exists,service]);
  if (!o) return <NotFound/>;
  const people = officers?.id===o.id?officers.list:o.officers ?? [];
  const own = posts.filter(p=>p.organizationId===o.id);
  const hosted = events.filter(e=>e.hostId===o.id).sort(byDate);
  const stats:[number,string][] =
    o.type==='school'?[[o.studentCount ?? 0,'elever'],[o.followers,'følgere'],[own.length,'innlegg']]
    :o.type==='county_board'?[[o.memberCount ?? 0,'elevråd'],[people.length || (o.officerCount ?? 0),'i fylkesstyret'],[own.length,'innlegg']]
    :[[o.memberCount ?? 0,o.type==='national'?'medlemsråd':'elevråd'],[o.followers,'følgere'],[own.length,'innlegg']];
  const isActiveOrg = activeRep?.organizationId===o.id;
  return <div className="page">
    <div className="org-hero">
      <div className={`org-cover ${o.type}`}/>
      <div className="org-hero-body">
        <div className="org-identity">
          <span className={`org-avatar ${o.type==='national'?'coral':''}`} aria-hidden="true">{o.initials}</span>
          <div className="names"><h1>{o.name}</h1><p>{orgLine(o)}</p></div>
          {o.status!=='active'&&<Status tone="gray">Deaktivert</Status>}
        </div>
        <p className="org-bio">{o.bio}</p>
        <div className="org-actions">
          {isActiveOrg&&activeRep?.canPublish
            ?<button className="btn ghost large" onClick={openComposer}>Nytt innlegg som {o.name}</button>
            :<button className="btn ghost large" onClick={()=>onContact(o)}>{contactLabel(o)}</button>}
        </div>
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
    <section>
      <h2 className="section-title">{o.type==='school'?'Innlegg fra elevrådet':o.type==='national'?'Innlegg fra EO':o.type==='county_board'?'Innlegg fra fylkeslaget':'Innlegg fra lokallaget'}</h2>
      <div className="list" style={{ gap:16 }}>{own.map(p=><PostCard key={p.id} post={p} plain/>)}</div>
      {!own.length&&<p className="empty-note">Ingen innlegg ennå.</p>}
    </section>
  </div>;
}
