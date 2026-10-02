import { useEffect, useState } from 'react';
import { useApp } from '@/components/app-context';
import { hasOfficers, orgSub } from '@/components/format';
import type { Route } from '@/components/routing';
import { useService } from '@/components/service-provider';
import { FollowButton } from '@/components/shared/org-row';
import { Avatar, SearchField, Status } from '@/components/shared/ui';
import { initialsOf } from '@/lib/domain/labels';
import { SEARCH_MIN_LENGTH, searchGroups, type SearchResult } from '@/lib/domain/search';
import { formatDate } from '@/lib/domain/time';
import { errorMessage } from '@/lib/domain/validation';

// Utforsk (§6): uten søk vises elevråd i fylket, fylkeslag og EO og nye innlegg. Med søk brukes fulltekstsøket på
// serveren (skoler, styrer, personer, arrangementer og innlegg). Deaktiverte skoler og tidligere tillitsvalgte
// vises bare når brukeren krysser av for det.

const SEARCH_DELAY_MS = 250;

export function ExploreView({query,setQuery}:{query:string;setQuery:(v:string)=>void}) {
  const { currentUser, organizations, posts, org, go, toggleFollow } = useApp();
  const home = currentUser?.schoolId?org(currentUser.schoolId):undefined;
  const county = home?.county ?? 'Oslo';
  const countyBoard = organizations.find(o=>o.type==='county_board'&&o.county===county);
  const searching = query.trim().length>=SEARCH_MIN_LENGTH;
  const schools = organizations.filter(o=>o.type==='school'&&o.status==='active'&&o.county===county&&hasOfficers(o));
  const levels = organizations.filter(o=>o.status==='active'&&(o.type==='national'||(o.type==='county_board'&&o.county===county)));
  return <div className="page" style={{ gap:26 }}>
    <div>
      <h1 style={{ marginBottom:12 }}>Utforsk</h1>
      <SearchField size="lg" value={query} onChange={setQuery} label="Søk i Elevrådsnett" placeholder="Søk etter skoler, styrer, personer, arrangementer eller innlegg"/>
    </div>
    {searching?<SearchResults query={query.trim()}/>:<>
      <section>
        <h2 style={{ marginBottom:4 }}>Aktivt i ditt fylke</h2>
        <p className="muted" style={{ marginBottom:14 }}>{county} · {countyBoard?.memberCount ?? schools.length} elevråd på plattformen</p>
        <div className="explore-grid">
          {schools.map(o=><div className="org-tile" key={o.id}>
            <div className="top"><Avatar initials={o.initials} size="lg" orgType={o.type}/><div className="grow"><button className="name-link" onClick={()=>go({ view:'organization', id:o.id })}>{o.name}</button><p className="sub">{orgSub(o)}</p></div></div>
            <div className="actions"><FollowButton org={o} className="" onClick={()=>toggleFollow(o.id)}/><button className="btn" onClick={()=>go({ view:'organization', id:o.id })}>Se side</button></div>
          </div>)}
        </div>
        {!schools.length&&<p className="empty-note">Ingen elevråd i {county} har tillitsvalgte på plattformen ennå.</p>}
      </section>
      <section>
        <h2 className="section-title">Fylkeslag og EO</h2>
        <div className="level-list">{levels.map(o=><div className="level-row" key={o.id}>
          <Avatar initials={o.initials} tone="coral" size="lg" orgType={o.type}/>
          <div className="grow" style={{ minWidth:180 }}><button className="name-link" onClick={()=>go({ view:'organization', id:o.id })}>{o.name}</button><p className="sub">{orgSub(o)}</p></div>
          <button className="btn ghost" onClick={()=>go({ view:'organization', id:o.id })}>Åpne</button>
        </div>)}</div>
      </section>
      <section>
        <h2 className="section-title">Nye innlegg</h2>
        <div className="list">{posts.slice(0,4).map(p=><button className="excerpt-row" key={p.id} aria-label={`${p.organizationName}: ${p.body.split('\n')[0]}`} onClick={()=>go({ view:'post', id:p.id })}>
          <span className="thumb-ph" aria-hidden="true"/>
          <span className="grow"><span className="name">{p.organizationName}</span><span className="text">{p.body.split('\n')[0].slice(0,96)}…</span></span>
        </button>)}</div>
        {!posts.length&&<p className="empty-note">Ingen innlegg ennå.</p>}
      </section>
    </>}
  </div>;
}

/** Treffene fra serveren, gruppert etter type. Søket kjøres litt etter at brukeren har sluttet å skrive. */
function SearchResults({query}:{query:string}){
  const service = useService();
  const { go } = useApp();
  const [includeFormer,setIncludeFormer] = useState(false);
  const [state,setState] = useState<{ key:string; results:SearchResult[]|null; error:string }>({ key:'', results:null, error:'' });
  const key = `${query}|${includeFormer}`;
  useEffect(()=>{
    let cancelled = false;
    const timer = window.setTimeout(()=>{
      service.search({ query, includeFormer })
        .then(results=>{ if (!cancelled) setState({ key, results, error:'' }); })
        .catch(e=>{ if (!cancelled) setState({ key, results:null, error:errorMessage(e) }); });
    },SEARCH_DELAY_MS);
    return ()=>{ cancelled = true; window.clearTimeout(timer); };
  },[service,query,includeFormer,key]);
  const current = state.key===key;
  const results = current?state.results:null;
  const target = (r:SearchResult):Route|null=>{
    if (r.kind==='person') return r.active?{ view:'person', id:r.id }:null;
    if (r.kind==='event') return { view:'event', id:r.id };
    if (r.kind==='post') return { view:'post', id:r.id };
    return { view:'organization', id:r.id };
  };
  return <section aria-live="polite" aria-busy={!current}>
    <div className="search-options">
      <p className="muted">{results?`${results.length} treff for «${query}»`:current&&state.error?'':'Søker …'}</p>
      <div className="check-row"><input type="checkbox" id="include-former" checked={includeFormer} onChange={e=>setIncludeFormer(e.target.checked)}/>
        <label htmlFor="include-former">Vis tidligere tillitsvalgte og deaktiverte skoler</label></div>
    </div>
    {current&&state.error&&<p className="form-error" role="alert">{state.error}</p>}
    {results&&!results.length&&<p className="empty-note">Ingen treff. Prøv navnet på skolen, en person, et arrangement eller et tema.</p>}
    {searchGroups.map(group=>{
      const hits = (results ?? []).filter(r=>group.kinds.includes(r.kind));
      if (!hits.length) return null;
      return <div key={group.id} className="stack" style={{ marginTop:18 }}>
        <h2 className="section-title">{group.label}</h2>
        <div className="result-list">{hits.map(r=>{
          const route = target(r);
          const body = <>
            {r.kind==='post'||r.kind==='event'?<span className="thumb-ph" aria-hidden="true"/>:<Avatar size="sm" tone="pale" initials={initialsOf(r.title)} orgType={r.kind==='person'?undefined:r.kind}/>}
            <span className="grow"><strong>{r.kind==='post'?r.title.split('\n')[0]:r.title}</strong>
              <small>{[r.subtitle,r.startsAt&&r.kind==='event'?formatDate(r.startsAt):undefined].filter(Boolean).join(' · ')}</small></span>
            {!r.active&&<Status tone="gray">{r.kind==='person'?'Tidligere tillitsvalgt':r.kind==='event'?'Avsluttet':'Deaktivert'}</Status>}
          </>;
          return route
            ?<button key={`${r.kind}-${r.id}`} className="result-row" onClick={()=>go(route)}>{body}</button>
            :<div key={`${r.kind}-${r.id}`} className="result-row">{body}</div>;
        })}</div>
      </div>;
    })}
  </section>;
}
