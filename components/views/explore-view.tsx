import { useApp } from '@/components/app-context';
import { hasOfficers, orgSub } from '@/components/format';
import { FollowButton } from '@/components/shared/org-row';
import { Avatar, SearchField } from '@/components/shared/ui';

export function ExploreView({query,setQuery}:{query:string;setQuery:(v:string)=>void}) {
  const { currentUser, organizations, posts, org, go, toggleFollow } = useApp();
  const home = currentUser?.schoolId?org(currentUser.schoolId):undefined;
  const county = home?.county ?? 'Oslo';
  const countyBoard = organizations.find(o=>o.type==='county_board'&&o.county===county);
  const q = query.trim().toLowerCase();
  const schools = organizations.filter(o=>o.type==='school'&&o.status==='active');
  const shown = q
    ? schools.filter(o=>[o.name,o.schoolName,o.bio,o.county,o.place].join(' ').toLowerCase().includes(q))
    : schools.filter(o=>o.county===county&&hasOfficers(o));
  const levels = organizations.filter(o=>o.status==='active'&&(o.type==='national'||(o.type==='county_board'&&o.county===county)));
  const recent = (q?posts.filter(p=>[p.body,p.organizationName,...(p.tags ?? [])].join(' ').toLowerCase().includes(q)):posts).slice(0,4);
  return <div className="page" style={{ gap:26 }}>
    <div>
      <h1 style={{ marginBottom:12 }}>Utforsk</h1>
      <SearchField size="lg" value={query} onChange={setQuery} label="Søk i Elevrådsnett" placeholder="Søk etter elevråd, fylkeslag, skoler eller temaer"/>
    </div>
    <section>
      <h2 style={{ marginBottom:4 }}>{q?'Elevråd':'Aktivt i ditt fylke'}</h2>
      <p className="muted" style={{ marginBottom:14 }}>{q?`${shown.length} treff for «${query.trim()}»`:`${county} · ${countyBoard?.memberCount ?? shown.length} elevråd på plattformen`}</p>
      <div className="explore-grid">
        {shown.map(o=><div className="org-tile" key={o.id}>
          <div className="top"><Avatar initials={o.initials} size="lg" orgType={o.type}/><div className="grow"><button className="name-link" onClick={()=>go({ view:'organization', id:o.id })}>{o.name}</button><p className="sub">{orgSub(o)}</p></div></div>
          <div className="actions"><FollowButton org={o} className="" onClick={()=>toggleFollow(o.id)}/><button className="btn" onClick={()=>go({ view:'organization', id:o.id })}>Se side</button></div>
        </div>)}
      </div>
      {!shown.length&&<p className="empty-note">Ingen treff. Prøv navnet på skolen, fylket eller et tema.</p>}
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
      <h2 className="section-title">{q?'Innlegg':'Nye innlegg'}</h2>
      <div className="list">{recent.map(p=><button className="excerpt-row" key={p.id} aria-label={`${p.organizationName}: ${p.body.split('\n')[0]}`} onClick={()=>go({ view:'organization', id:p.organizationId })}>
        <span className="thumb-ph" aria-hidden="true"/>
        <span className="grow"><span className="name">{p.organizationName}</span><span className="text">{p.body.split('\n')[0].slice(0,96)}…</span></span>
      </button>)}</div>
      {!recent.length&&<p className="empty-note">Ingen innlegg matcher søket.</p>}
    </section>
  </div>;
}
