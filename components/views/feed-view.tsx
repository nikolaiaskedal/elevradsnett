import { useState } from 'react';
import { useApp } from '@/components/app-context';
import { byDate, hasOfficers } from '@/components/format';
import { EventMini } from '@/components/shared/event-mini';
import { isPastEvent } from '@/lib/domain/events';
import { OrgRow } from '@/components/shared/org-row';
import { PostCard } from '@/components/shared/post-card';
import { SearchField } from '@/components/shared/ui';
import { feedModeLabel } from '@/lib/domain/search';

export function FeedView({query,setQuery}:{query:string;setQuery:(v:string)=>void}) {
  const { currentUser, events, organizations, posts, org, go, signedIn, feedMode, setFeedMode } = useApp();
  const [scope,setScope] = useState<'all'|'county'>('all');
  const home = currentUser?.schoolId?org(currentUser.schoolId):undefined;
  const county = home?.county ?? 'Oslo';
  const nearby = organizations.filter(o=>o.type==='school'&&o.status==='active'&&o.county===county&&o.id!==currentUser?.schoolId&&hasOfficers(o)).slice(0,4);
  const levels = organizations.filter(o=>o.status==='active'&&(o.type==='national'||(o.type==='county_board'&&o.county===county)));
  const upcoming = events.filter(e=>e.status==='published' && !isPastEvent(e)).sort(byDate).slice(0,3);
  const visible = scope==='all'?posts:posts.filter(p=>org(p.organizationId)?.county===county);
  return <div className="page">
    <h1>Hjem</h1>
    <SearchField value={query} onChange={setQuery} onSubmit={()=>go({ view:'explore' })} label="Søk i Elevrådsnett" placeholder="Søk etter elevråd, fylkeslag, skoler eller temaer" buttonLabel="Søk"/>
    <section className="panel" aria-labelledby="network-title">
      <div className="panel-head"><h2 id="network-title">Nettverk</h2><button className="link" onClick={()=>go({ view:'explore' })}>Se alle</button></div>
      <div className="network-grid">
        <div className="network-col">
          <p className="eyebrow">Aktivt i ditt fylke</p>
          {nearby.map(o=><OrgRow key={o.id} org={o}/>)}
        </div>
        <div className="network-col">
          <p className="eyebrow">Fylkeslag og EO</p>
          {levels.map(o=><OrgRow key={o.id} org={o} openOnly/>)}
        </div>
      </div>
    </section>
    <section className="panel warm" aria-labelledby="events-title">
      <div className="panel-head"><h2 id="events-title">Arrangementer</h2><button className="link" onClick={()=>go({ view:'events' })}>Se alle</button></div>
      <div className="event-mini-grid">{upcoming.map(e=><EventMini key={e.id} event={e}/>)}</div>
    </section>
    <div className="feed-head">
      <h2>Nytt fra elevrådene</h2>
      <div className="feed-controls">
        {signedIn&&<div className="segmented" role="group" aria-label="Sortering av feeden">
          {(['recommended','chronological'] as const).map(m=><button key={m} className={feedMode===m?'on':''} aria-pressed={feedMode===m} onClick={()=>{ if (feedMode!==m) setFeedMode(m); }}>{feedModeLabel[m]}</button>)}
        </div>}
        <div className="segmented" role="group" aria-label="Filtrer innlegg">
          <button className={scope==='all'?'on':''} aria-pressed={scope==='all'} onClick={()=>setScope('all')}>Alle</button>
          <button className={scope==='county'?'on':''} aria-pressed={scope==='county'} onClick={()=>setScope('county')}>{county}</button>
        </div>
      </div>
    </div>
    {signedIn&&feedMode==='recommended'&&<p className="small-note muted">Anbefalt viser først prioriterte innlegg fra EO og styret ditt, så innlegg fra skolen din, området og dem du følger. Nyere innlegg veier mer.</p>}
    {visible.map(post=><PostCard key={post.id} post={post}/>)}
    {!visible.length&&<p className="empty-note">Ingen innlegg fra {county} ennå.</p>}
  </div>;
}
