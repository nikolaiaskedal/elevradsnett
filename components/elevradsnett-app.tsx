'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AdminPanel, LegalView, legalPages, type LegalPage } from '@/components/elevradsnett-admin';
import { Avatar, CommentIcon, Logo, Modal, SearchField, ShareIcon, Status, SupportIcon } from '@/components/elevradsnett-ui';
import { conversations as initialConversations, currentUser, events, initialPosts, organizations as initialOrganizations, representations } from '@/lib/demo-data';
import type { Audience, Comment, Conversation, Event, EventCategory, EventResponse, Organization, Post, Representation } from '@/lib/domain/types';

type Route =
  | { view:'feed' } | { view:'explore' } | { view:'events' } | { view:'event'; id:string } | { view:'organization'; id:string }
  | { view:'messages' } | { view:'profile' } | { view:'login' } | { view:'admin' } | { view:'legal'; page:LegalPage };

declare global { interface Document { modelContext?: { registerTool:(tool:{name:string;title?:string;description:string;inputSchema:object;annotations?:{readOnlyHint?:boolean;untrustedContentHint?:boolean};execute:(input:unknown)=>unknown},options?:{signal?:AbortSignal})=>void|Promise<void> } } }

// ---------- Routing (hash based, so the static GitHub Pages build works without server rewrites) ----------
const simpleRoutes:Record<string,Route> = { '':{view:'feed'}, utforsk:{view:'explore'}, arrangementer:{view:'events'}, meldinger:{view:'messages'}, profil:{view:'profile'}, 'logg-inn':{view:'login'}, admin:{view:'admin'} };
function parseHash(hash:string):Route {
  const [first='',second] = decodeURIComponent(hash.replace(/^#\/?/,'')).split('/');
  if (first==='arrangementer' && second) return { view:'event', id:second };
  if (first==='org' && second) return { view:'organization', id:second };
  if (first==='info') return { view:'legal', page:legalPages.some(([id])=>id===second)?second as LegalPage:'privacy' };
  return simpleRoutes[first] ?? { view:'feed' };
}
function routeHash(route:Route) {
  switch (route.view) {
    case 'event': return `#/arrangementer/${route.id}`;
    case 'organization': return `#/org/${route.id}`;
    case 'legal': return `#/info/${route.page}`;
    default: return `#/${Object.entries(simpleRoutes).find(([,r])=>r.view===route.view)?.[0] ?? ''}`;
  }
}

// ---------- Presentation helpers ----------
const MONTHS = ['JAN','FEB','MAR','APR','MAI','JUN','JUL','AUG','SEP','OKT','NOV','DES'];
const categoryLabel:Record<EventCategory,string> = { landsmote:'Landsmøte', kurs:'Kurs', samling:'Samling', mote:'Møte', digitalt:'Digitalt', annet:'Arrangement' };
const audienceLabel:Record<Audience,string> = { public:'Alle elevråd', county:'Elevråd i fylket', local:'Elevråd i lokallaget', friends:'Venneråd' };
const kindLabel:Record<Organization['type'],string> = { national:'Nasjonalt', county_board:'Fylkeslag', local_board:'Lokallag', school:'Elevråd' };
const systemRoles = ['Elevrådsleder','Elevrådsmedlem','Fylkesstyremedlem','Sentralstyremedlem','Administrator'];
const formatNumber = (n:number)=>n.toLocaleString('nb-NO');
const eventDay = (e:Event)=>e.startsAt.slice(8,10);
const eventMonth = (e:Event)=>MONTHS[Number(e.startsAt.slice(5,7))-1] ?? '';
const eventWhen = (e:Event)=>e.end?`${e.start}, ${e.end}`:e.start;
const initialsOf = (name:string)=>name.trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase() ?? '').join('');
const byDate = (a:Event,b:Event)=>a.startsAt.localeCompare(b.startsAt);
function orgLine(o:Organization) {
  if (o.type==='national') return ['Nasjonal interesseorganisasjon',o.contactEmail].filter(Boolean).join(' · ');
  if (o.type==='school') return [o.contactEmail,o.county].filter(Boolean).join(' · ');
  return [kindLabel[o.type],o.county,o.contactEmail].filter(Boolean).join(' · ');
}
const orgSub = (o:Organization)=>o.type==='national'?'Nasjonalt':`${o.county} · ${kindLabel[o.type]}`;
const schoolPlace = (o:Organization)=>o.place && o.place!==o.county?`${o.place} · ${o.county}`:o.county;
function eventFacts(e:Event) {
  const third = e.price ? { label:'Pris', value:e.price } : e.seatsPerOrganization ? { label:'Plasser', value:`${e.seatsPerOrganization} per elevråd` } : { label:'Påmelding', value:e.deadline?`Innen ${e.deadline}`:'Ikke nødvendig' };
  return [{ label:'Dato', value:eventWhen(e) }, { label:e.digital?'Hvor':'Sted', value:e.place }, third];
}
function contactLabel(o:Organization) {
  return o.type==='national'?'Kontakt EO':o.type==='county_board'?'Kontakt fylkesstyret':o.type==='local_board'?'Kontakt lokallaget':'Foreslå samarbeid';
}

// ---------- Shared app state ----------
type App = {
  organizations:Organization[]; posts:Post[]; activeRep:Representation; responses:Record<string,EventResponse|undefined>;
  liked:string[]; openComments:string[]; drafts:Record<string,string>; votes:Record<string,string>;
  org:(id:string)=>Organization|undefined; go:(route:Route)=>void; notify:(text:string)=>void;
  toggleFollow:(id:string)=>void; toggleLike:(id:string)=>void; toggleComments:(id:string)=>void;
  setDraft:(id:string,text:string)=>void; sendComment:(id:string)=>void; vote:(postId:string,optionId:string)=>void;
  respond:(eventId:string,response:EventResponse)=>void; share:(post:Post)=>void; openComposer:()=>void;
};
const AppContext = createContext<App|null>(null);
function useApp() { const app=useContext(AppContext); if (!app) throw new Error('AppContext mangler'); return app; }

export default function ElevradsnettApp() {
  const [route,setRoute] = useState<Route>({ view:'feed' });
  const [activeRepId,setActiveRepId] = useState(representations[0].id);
  const [organizations,setOrganizations] = useState<Organization[]>(initialOrganizations);
  const [posts,setPosts] = useState<Post[]>(initialPosts);
  const [liked,setLiked] = useState<string[]>([]);
  const [openComments,setOpenComments] = useState<string[]>([]);
  const [drafts,setDrafts] = useState<Record<string,string>>({});
  const [votes,setVotes] = useState<Record<string,string>>({});
  const [responses,setResponses] = useState<Record<string,EventResponse|undefined>>({});
  const [query,setQuery] = useState('');
  const [conversations,setConversations] = useState<Conversation[]>(initialConversations);
  const [conversationId,setConversationId] = useState(initialConversations[0].id);
  const [composerOpen,setComposerOpen] = useState(false);
  const [toast,setToast] = useState('');

  const activeRep = representations.find(r=>r.id===activeRepId) ?? representations[0];
  const org = useCallback((id:string)=>organizations.find(o=>o.id===id),[organizations]);

  useEffect(()=>{
    const sync=()=>setRoute(parseHash(window.location.hash));
    sync();
    window.addEventListener('hashchange',sync);
    return ()=>window.removeEventListener('hashchange',sync);
  },[]);
  const go = useCallback((next:Route)=>{
    const hash=routeHash(next);
    if (window.location.hash!==hash) window.location.hash=hash; else setRoute(next);
    window.scrollTo({ top:0 });
  },[]);
  const notify = useCallback((text:string)=>{ setToast(text); window.setTimeout(()=>setToast(current=>current===text?'':current),2800); },[]);
  const toggle = (list:string[],id:string)=>list.includes(id)?list.filter(x=>x!==id):[...list,id];

  const sendComment = (postId:string)=>{
    const body=(drafts[postId] ?? '').trim();
    if (!body) return;
    const comment:Comment = { id:`c-${Date.now()}`, organizationId:activeRep.organizationId, organizationName:activeRep.name, actorName:currentUser.name, createdAt:'nå', body };
    setPosts(all=>all.map(p=>p.id===postId?{ ...p, comments:p.comments+1, commentItems:[...(p.commentItems ?? []),comment] }:p));
    setDrafts(all=>({ ...all, [postId]:'' }));
  };
  const share = async (post:Post)=>{
    const url=`${window.location.href.split('#')[0]}${routeHash({ view:'organization', id:post.organizationId })}`;
    const shareFn=(navigator as Navigator & { share?:(data:ShareData)=>Promise<void> }).share;
    try {
      if (shareFn) { await shareFn.call(navigator,{ title:`${post.organizationName} på Elevrådsnett`, text:post.body.slice(0,100), url }); }
      else { await navigator.clipboard.writeText(url); notify('Lenken er kopiert'); }
    } catch { /* Brukeren avbrøt delingen */ }
  };
  const publish = (post:Post)=>{ setPosts(all=>[post,...all]); setComposerOpen(false); go({ view:'feed' }); notify(`Publisert som ${activeRep.name}`); };
  const openConversationWith = (o:Organization)=>{
    const existing=conversations.find(c=>c.organizationId===o.id);
    if (existing) { setConversationId(existing.id); }
    else {
      const created:Conversation = { id:`c-${o.id}`, name:o.name, initials:o.initials, subtitle:orgSub(o), organizationId:o.id, kind:'group', unread:0, members:(o.officers?.length ?? 1)+1, messages:[] };
      setConversations(all=>[created,...all]);
      setConversationId(created.id);
    }
    go({ view:'messages' });
  };

  const app:App = {
    organizations, posts, activeRep, responses, liked, openComments, drafts, votes, org, go, notify,
    toggleFollow:id=>setOrganizations(all=>all.map(o=>o.id===id?{ ...o, following:!o.following, followers:o.followers+(o.following?-1:1) }:o)),
    toggleLike:id=>setLiked(all=>toggle(all,id)),
    toggleComments:id=>setOpenComments(all=>toggle(all,id)),
    setDraft:(id,text)=>setDrafts(all=>({ ...all, [id]:text })),
    sendComment, share:post=>void share(post),
    vote:(postId,optionId)=>setVotes(all=>({ ...all, [postId]:optionId })),
    respond:(eventId,response)=>setResponses(all=>({ ...all, [eventId]:all[eventId]===response?undefined:response })),
    openComposer:()=>setComposerOpen(true),
  };

  useEffect(()=>{
    const context=document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle=new AbortController();
    const views:Record<string,Route> = { feed:{view:'feed'}, explore:{view:'explore'}, events:{view:'events'}, messages:{view:'messages'}, profile:{view:'profile'}, admin:{view:'admin'} };
    const run=async()=>{
      await context.registerTool({ name:'navigate_elevradsnett', title:'Åpne side', description:'Åpner en hovedside i Elevrådsnett.', inputSchema:{ type:'object', properties:{ view:{ type:'string', enum:Object.keys(views) } }, required:['view'], additionalProperties:false }, annotations:{ readOnlyHint:true, untrustedContentHint:false },
        execute:input=>{ const value=(input as { view?:string }).view ?? ''; if (!views[value]) throw new Error('Ugyldig side'); go(views[value]); return { view:value }; } },{ signal:lifecycle.signal });
      await context.registerTool({ name:'start_post_creation', title:'Start nytt innlegg', description:'Åpner publiseringsdialogen for aktiv representasjon.', inputSchema:{ type:'object', properties:{}, additionalProperties:false }, annotations:{ readOnlyHint:false, untrustedContentHint:false },
        execute:()=>{ if (!activeRep.canPublish) throw new Error('Aktiv representasjon har ikke publiseringsrett'); setComposerOpen(true); return { organization:activeRep.name, status:'composer_open' }; } },{ signal:lifecycle.signal });
    };
    void run().catch(()=>{});
    return ()=>lifecycle.abort();
  },[activeRep,go]);

  const unread = conversations.reduce((n,c)=>n+c.unread,0);
  const nav:{ label:string; route:Route; on:boolean; count?:number }[] = [
    { label:'Hjem', route:{ view:'feed' }, on:route.view==='feed' },
    { label:'Arrangementer', route:{ view:'events' }, on:route.view==='events'||route.view==='event' },
    { label:'Meldinger', route:{ view:'messages' }, on:route.view==='messages', count:unread },
    { label:'Profil', route:{ view:'profile' }, on:route.view==='profile' },
    { label:'Logg inn', route:{ view:'login' }, on:route.view==='login' },
  ];

  let page:React.ReactNode;
  switch (route.view) {
    case 'explore': page=<ExploreView query={query} setQuery={setQuery}/>; break;
    case 'events': page=<EventsView/>; break;
    case 'event': page=<EventDetail id={route.id}/>; break;
    case 'organization': page=<OrganizationView id={route.id} onContact={openConversationWith}/>; break;
    case 'messages': page=<MessagesView conversations={conversations} setConversations={setConversations} selectedId={conversationId} onSelect={setConversationId}/>; break;
    case 'profile': page=<ProfileView onSwitch={rep=>{ setActiveRepId(rep.id); notify(`Du representerer nå ${rep.name}`); }}/>; break;
    case 'login': page=<LoginView onFinish={(name,school)=>{ go({ view:'feed' }); notify(`Velkommen, ${name || currentUser.name}! Du er koblet til ${school?.name ?? 'Elevrådsnett'}.`); }}/>; break;
    case 'admin': page=<AdminPanel activeRep={activeRep} onNotify={notify}/>; break;
    case 'legal': page=<LegalView page={route.page} onPage={p=>go({ view:'legal', page:p })}/>; break;
    default: page=<FeedView query={query} setQuery={setQuery}/>;
  }

  return <AppContext.Provider value={app}>
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <button className="logo-button" onClick={()=>go({ view:'feed' })}><Logo/></button>
          <nav className="main-nav" aria-label="Hovedmeny">
            {nav.map(item=><button key={item.label} className={`nav-link ${item.on?'on':''}`} aria-current={item.on?'page':undefined} onClick={()=>go(item.route)}>
              {item.label}{item.count?<span className="nav-count" aria-label={`${item.count} uleste`}>{item.count}</span>:null}
            </button>)}
          </nav>
          <button className="btn primary lifted" onClick={()=>setComposerOpen(true)}>Nytt innlegg</button>
        </div>
      </header>
      <main className="main">{page}</main>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <Logo/>
          <nav aria-label="Informasjon">
            {legalPages.map(([id,label])=><button key={id} onClick={()=>go({ view:'legal', page:id })}>{label}</button>)}
            <button onClick={()=>go({ view:'admin' })}>Administrasjon</button>
          </nav>
          <span>© 2026 Elevorganisasjonen</span>
        </div>
      </footer>
      <Composer open={composerOpen} onClose={()=>setComposerOpen(false)} onPublish={publish}/>
      {toast&&<div className="toast" role="status">{toast}</div>}
    </div>
  </AppContext.Provider>;
}

// ---------- Feed ----------
function FeedView({query,setQuery}:{query:string;setQuery:(v:string)=>void}) {
  const { organizations, posts, org, go } = useApp();
  const [scope,setScope] = useState<'all'|'county'>('all');
  const home = org(currentUser.schoolId);
  const county = home?.county ?? 'Oslo';
  const nearby = organizations.filter(o=>o.type==='school'&&o.status==='active'&&o.county===county&&o.id!==currentUser.schoolId&&o.officers).slice(0,4);
  const levels = organizations.filter(o=>o.status==='active'&&(o.type==='national'||(o.type==='county_board'&&o.county===county)));
  const upcoming = [...events].sort(byDate).slice(0,3);
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
      <div className="segmented" role="group" aria-label="Filtrer innlegg">
        <button className={scope==='all'?'on':''} aria-pressed={scope==='all'} onClick={()=>setScope('all')}>Alle</button>
        <button className={scope==='county'?'on':''} aria-pressed={scope==='county'} onClick={()=>setScope('county')}>{county}</button>
      </div>
    </div>
    {visible.map(post=><PostCard key={post.id} post={post}/>)}
    {!visible.length&&<p className="empty-note">Ingen innlegg fra {county} ennå.</p>}
  </div>;
}

function OrgRow({org:o,openOnly}:{org:Organization;openOnly?:boolean}) {
  const { go, toggleFollow } = useApp();
  const open=()=>go({ view:'organization', id:o.id });
  return <div className="org-row">
    <Avatar initials={o.initials} tone={openOnly?'coral':'navy'}/>
    <div className="grow"><button className="name-link" onClick={open}>{o.name}</button><p className="sub">{orgSub(o)}</p></div>
    {openOnly
      ?<button className="btn ghost small follow" onClick={open}>Åpne</button>
      :<FollowButton org={o} onClick={()=>toggleFollow(o.id)}/>}
  </div>;
}

function FollowButton({org:o,onClick,className='small follow'}:{org:Organization;onClick:()=>void;className?:string}) {
  return <button className={`btn ${className} ${o.following?'soft-on':'on'}`} aria-pressed={!!o.following} onClick={onClick}>{o.following?'Følger':'Følg'}</button>;
}

function EventMini({event:e,flat}:{event:Event;flat?:boolean}) {
  const { go } = useApp();
  return <button className={`event-mini ${flat?'flat':''}`} onClick={()=>go({ view:'event', id:e.id })}>
    <span className="date-box">{eventDay(e)}<small>{eventMonth(e)}</small></span>
    <span className="grow"><span className="title">{e.title}</span><span className="sub">{flat?`${e.start} · ${e.place}`:`${e.host} · ${e.place}`}</span></span>
  </button>;
}

function PostCard({post,plain}:{post:Post;plain?:boolean}) {
  const { org, go, activeRep, liked, openComments, drafts, votes, toggleLike, toggleComments, setDraft, sendComment, vote, share, notify } = useApp();
  const [menuOpen,setMenuOpen] = useState(false);
  const menuWrap = useRef<HTMLDivElement>(null);
  const closeMenuOutside = (e:React.FocusEvent)=>{ if (!menuWrap.current?.contains(e.relatedTarget as Node|null)) setMenuOpen(false); };
  const author = org(post.organizationId);
  const isLiked = liked.includes(post.id);
  const commentsOpen = openComments.includes(post.id);
  const linkedEvent = post.eventId?events.find(e=>e.id===post.eventId):undefined;
  const openOrg=()=>go({ view:'organization', id:post.organizationId });
  return <article className={`post ${plain?'plain':''}`}>
    <div className="post-head">
      <button className="post-avatar" onClick={openOrg} aria-label={`Åpne ${post.organizationName}`}><Avatar initials={post.initials} size="lg" tone={author?.type==='national'?'coral':'navy'}/></button>
      <div className="who">
        <button className="name-link" onClick={openOrg}>{post.organizationName}</button>
        <p className="sub">{post.actorName} · {post.createdAt}{post.edited?' · redigert':''}</p>
      </div>
      {!plain&&<div className="post-more-wrap" ref={menuWrap}>
        <button className="post-more" aria-label="Flere valg" aria-haspopup="menu" aria-expanded={menuOpen} onClick={()=>setMenuOpen(v=>!v)} onBlur={closeMenuOutside} onKeyDown={e=>{ if (e.key==='Escape') setMenuOpen(false); }}>···</button>
        {menuOpen&&<div className="menu" role="menu" tabIndex={-1} onBlur={closeMenuOutside} onKeyDown={e=>{ if (e.key==='Escape') setMenuOpen(false); }}>
          <button role="menuitem" onClick={()=>{ setMenuOpen(false); share(post); }}>Del innlegget</button>
          <button role="menuitem" onClick={()=>{ setMenuOpen(false); notify('Innlegget er rapportert til moderatorene'); }}>Rapporter innlegg</button>
        </div>}
      </div>}
    </div>
    <p className="post-body">{post.body}</p>
    {post.media?.map(m=><div className="media-ph" key={m.id} role="img" aria-label={m.alt}><span className="media-label">{m.alt}</span></div>)}
    {linkedEvent&&!plain&&<div className="post-event"><EventMini event={linkedEvent} flat/></div>}
    {post.poll&&<Poll post={post} voted={votes[post.id]} onVote={optionId=>vote(post.id,optionId)}/>}
    <div className="post-actions">
      <button className={`action ${isLiked?'on':''}`} aria-pressed={isLiked} aria-label={`Støtt innlegget, ${post.likes+(isLiked?1:0)} støtter`} onClick={()=>toggleLike(post.id)}><SupportIcon/>{post.likes+(isLiked?1:0)}</button>
      <button className={`action ${commentsOpen?'on':''}`} aria-expanded={commentsOpen} aria-label={`Kommentarer, ${post.comments}`} onClick={()=>toggleComments(post.id)}><CommentIcon/>{post.comments}</button>
      <button className="action" aria-label="Del innlegget" onClick={()=>share(post)}><ShareIcon/></button>
      {post.audience!=='public'&&<span className="audience-tag">{audienceLabel[post.audience]}</span>}
    </div>
    {commentsOpen&&<div className="comments">
      {(post.commentItems ?? []).map(c=><div className="comment" key={c.id}>
        <Avatar size="sm" tone="pale" initials={org(c.organizationId)?.initials ?? initialsOf(c.organizationName)}/>
        <div className="comment-bubble"><strong>{c.organizationName}</strong><span className="time"> · {c.createdAt}</span><p>{c.body}</p></div>
      </div>)}
      <form className="comment-form" onSubmit={e=>{ e.preventDefault(); sendComment(post.id); }}>
        <Avatar size="sm" initials={currentUser.initials}/>
        <input value={drafts[post.id] ?? ''} onChange={e=>setDraft(post.id,e.target.value)} aria-label="Skriv en kommentar" placeholder={`Skriv en kommentar som ${activeRep.name} …`}/>
        <button className="btn primary">Send</button>
      </form>
    </div>}
  </article>;
}

function Poll({post,voted,onVote}:{post:Post;voted?:string;onVote:(optionId:string)=>void}) {
  const poll=post.poll!;
  const options=poll.options.map(o=>({ ...o, votes:o.votes+(voted===o.id?1:0) }));
  const total=options.reduce((n,o)=>n+o.votes,0) || 1;
  const show=poll.resultsVisibility==='always' || voted!==undefined;
  return <div className="poll">
    <p className="poll-question">{poll.question}</p>
    <div className="poll-options" role="group" aria-label={poll.question}>
      {options.map(o=>{ const pct=Math.round(o.votes/total*100); return <button key={o.id} className={`poll-option ${voted===o.id?'chosen':''}`} aria-pressed={voted===o.id} aria-label={show?`${o.label}, ${pct} %`:o.label} onClick={()=>onVote(o.id)}>
        <span className="poll-fill" style={{ width:show?`${pct}%`:0 }}/>
        <span className="poll-label"><span>{o.label}</span><em>{show?`${pct}%`:''}</em></span>
      </button>; })}
    </div>
    <p className="poll-foot">{voted!==undefined?'Du har svart · ':''}{formatNumber(total)} svar fra elevråd</p>
  </div>;
}

// ---------- Explore ----------
function ExploreView({query,setQuery}:{query:string;setQuery:(v:string)=>void}) {
  const { organizations, posts, org, go, toggleFollow } = useApp();
  const home = org(currentUser.schoolId);
  const county = home?.county ?? 'Oslo';
  const countyBoard = organizations.find(o=>o.type==='county_board'&&o.county===county);
  const q = query.trim().toLowerCase();
  const schools = organizations.filter(o=>o.type==='school'&&o.status==='active');
  const shown = q
    ? schools.filter(o=>[o.name,o.schoolName,o.bio,o.county,o.place].join(' ').toLowerCase().includes(q))
    : schools.filter(o=>o.county===county&&o.officers);
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
          <div className="top"><Avatar initials={o.initials} size="lg"/><div className="grow"><button className="name-link" onClick={()=>go({ view:'organization', id:o.id })}>{o.name}</button><p className="sub">{orgSub(o)}</p></div></div>
          <div className="actions"><FollowButton org={o} className="" onClick={()=>toggleFollow(o.id)}/><button className="btn" onClick={()=>go({ view:'organization', id:o.id })}>Se side</button></div>
        </div>)}
      </div>
      {!shown.length&&<p className="empty-note">Ingen treff. Prøv navnet på skolen, fylket eller et tema.</p>}
    </section>
    <section>
      <h2 className="section-title">Fylkeslag og EO</h2>
      <div className="level-list">{levels.map(o=><div className="level-row" key={o.id}>
        <Avatar initials={o.initials} tone="coral" size="lg"/>
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

// ---------- Events ----------
function ResponseButtons({event:e,large}:{event:Event;large?:boolean}) {
  const { responses, respond } = useApp();
  const response=responses[e.id];
  return <>
    <button className={`btn ${large?'large':''} ${response==='going'?'on':''}`} aria-pressed={response==='going'} onClick={()=>respond(e.id,'going')}>Skal</button>
    <button className={`btn ${large?'large':''} ${response==='interested'?'soft-on':''}`} aria-pressed={response==='interested'} onClick={()=>respond(e.id,'interested')}>Interessert</button>
  </>;
}

function EventsView() {
  const { go } = useApp();
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

function EventDetail({id}:{id:string}) {
  const { org, go, responses } = useApp();
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

// ---------- Organization ----------
function OrganizationView({id,onContact}:{id:string;onContact:(o:Organization)=>void}) {
  const { org, posts, activeRep, openComposer } = useApp();
  const o = org(id);
  if (!o) return <NotFound/>;
  const own = posts.filter(p=>p.organizationId===o.id);
  const hosted = events.filter(e=>e.hostId===o.id).sort(byDate);
  const stats:[number,string][] =
    o.type==='school'?[[o.studentCount ?? 0,'elever'],[o.followers,'følgere'],[own.length,'innlegg']]
    :o.type==='county_board'?[[o.memberCount ?? 0,'elevråd'],[o.officers?.length ?? 0,'i fylkesstyret'],[own.length,'innlegg']]
    :[[o.memberCount ?? 0,o.type==='national'?'medlemsråd':'elevråd'],[o.followers,'følgere'],[own.length,'innlegg']];
  const isActiveOrg = activeRep.organizationId===o.id;
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
          {isActiveOrg&&activeRep.canPublish
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
    {!!o.officers?.length&&<section className="section-card">
      <h2>{o.officersTitle ?? 'Tillitsvalgte'}</h2>
      <div className="people-grid">{o.officers.map(p=><div className="person" key={p.id}><Avatar tone="pale" initials={initialsOf(p.name)}/><div className="grow"><strong>{p.name}</strong><p className="sub">{p.publicTitle}</p></div></div>)}</div>
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

// ---------- Messages ----------
function MessagesView({conversations,setConversations,selectedId,onSelect}:{conversations:Conversation[];setConversations:React.Dispatch<React.SetStateAction<Conversation[]>>;selectedId:string;onSelect:(id:string)=>void}) {
  const { go } = useApp();
  const [search,setSearch] = useState('');
  const [draft,setDraft] = useState('');
  const q = search.trim().toLowerCase();
  const hits = conversations.filter(c=>!q||`${c.name} ${c.subtitle ?? ''}`.toLowerCase().includes(q));
  const active = conversations.find(c=>c.id===selectedId) ?? conversations[0];
  useEffect(()=>{ if (active?.unread) setConversations(all=>all.map(c=>c.id===active.id?{ ...c, unread:0 }:c)); },[active,setConversations]);
  const send=()=>{
    const text=draft.trim();
    if (!text||!active) return;
    setConversations(all=>all.map(c=>c.id===active.id?{ ...c, messages:[...c.messages,{ id:`m-${Date.now()}`, from:currentUser.name.split(' ')[0], mine:true, text, time:'nå' }] }:c));
    setDraft('');
  };
  return <div className="page" style={{ gap:16 }}>
    <h1>Meldinger</h1>
    <div className="messages">
      <div className="convo-list">
        <SearchField size="sm" value={search} onChange={setSearch} label="Søk i samtaler" placeholder="Søk elevråd eller fylkeslag"/>
        {!hits.length&&<p className="empty-note">Ingen treff. Prøv navnet på skolen eller fylkeslaget.</p>}
        {hits.map(c=><button key={c.id} className={`convo ${c.id===active?.id?'on':''}`} aria-current={c.id===active?.id} onClick={()=>onSelect(c.id)}>
          <Avatar initials={c.initials}/>
          <span className="grow"><span className="name">{c.name}</span><span className="preview">{c.messages.at(-1)?.text ?? 'Ingen meldinger ennå'}</span></span>
          {c.unread>0&&<span className="unread" aria-label={`${c.unread} uleste`}>{c.unread}</span>}
        </button>)}
      </div>
      {active&&<div className="chat">
        <div className="chat-head">
          <Avatar initials={active.initials}/>
          <div className="grow">{active.organizationId?<button className="name-link" onClick={()=>go({ view:'organization', id:active.organizationId! })}>{active.name}</button>:<strong>{active.name}</strong>}<p className="sub">{active.subtitle ?? `${active.members} deltakere`}</p></div>
        </div>
        <div className="chat-log" aria-live="polite">
          {active.messages.map(m=><div key={m.id} className={`bubble-row ${m.mine?'mine':''}`}><div className="bubble"><p>{m.text}</p><time>{m.time}</time></div></div>)}
          {!active.messages.length&&<p className="chat-empty">Skriv den første meldingen til {active.name}.</p>}
        </div>
        <form className="chat-form" onSubmit={e=>{ e.preventDefault(); send(); }}>
          <input value={draft} onChange={e=>setDraft(e.target.value)} aria-label="Skriv en melding" placeholder="Skriv en melding …"/>
          <button className="btn primary">Send</button>
        </form>
      </div>}
    </div>
  </div>;
}

// ---------- Profile ----------
function ProfileView({onSwitch}:{onSwitch:(rep:Representation)=>void}) {
  const { org, go, activeRep } = useApp();
  const school = org(currentUser.schoolId);
  const held = new Set(representations.map(r=>r.publicRole));
  return <div className="page" style={{ gap:16 }}>
    <div className="profile-card">
      <Avatar initials={currentUser.initials} size="xl"/>
      <div className="names">
        <h1>{currentUser.name}</h1>
        <p className="role">{activeRep.publicRole}</p>
        <p className="school">{school?.schoolName ?? school?.name} · {school?.county}</p>
      </div>
      <button className="btn ghost large" onClick={()=>go({ view:'organization', id:currentUser.schoolId })}>Åpne elevrådets side</button>
    </div>
    <section className="section-card">
      <h2>Representerer</h2>
      <div className="list" style={{ gap:10 }}>
        {representations.map(rep=>{ const o=org(rep.organizationId); const on=rep.id===activeRep.id; return <div className={`rep-row ${on?'on':''}`} key={rep.id}>
          <button className="rep-main" onClick={()=>go({ view:'organization', id:rep.organizationId })}>
            <Avatar initials={rep.initials} size="lg" tone={on?'coral':'navy'}/>
            <span className="grow"><span className="rep-name">{rep.name}</span><span className="sub">{rep.publicRole} · {o?.contactEmail ?? o?.county}{rep.canPublish?'':' · kan ikke publisere'}</span></span>
          </button>
          {on?<Status tone="coral">Aktiv</Status>:<button className="btn small" onClick={()=>onSwitch(rep)}>Bruk</button>}
        </div>; })}
      </div>
      <p className="chip-label">Roller i systemet</p>
      <div className="chips">
        {systemRoles.map(role=><span key={role} className={`chip ${held.has(role)?'on':''}`}>{role}</span>)}
        {representations.filter(r=>r.type!=='school').map(r=><span key={r.id} className="chip navy">{r.publicRole} i {r.name}</span>)}
      </div>
      <p className="muted" style={{ marginTop:10, lineHeight:1.5 }}>Én representasjon er aktiv om gangen og bestemmer hvem du publiserer og kommenterer som. Meldinger er alltid personlige.</p>
    </section>
  </div>;
}

// ---------- Login / onboarding ----------
const leaderMonths = ['Mai','Juni','August','September','Oktober','Januar'];
function LoginView({onFinish}:{onFinish:(name:string,school?:Organization)=>void}) {
  const { organizations } = useApp();
  const [step,setStep] = useState(1);
  const [schoolQuery,setSchoolQuery] = useState('');
  const [schoolId,setSchoolId] = useState('');
  const [name,setName] = useState('');
  const [contactType,setContactType] = useState<'tlf'|'epost'>('tlf');
  const [contact,setContact] = useState('');
  const [month,setMonth] = useState('');
  const schools = useMemo(()=>organizations.filter(o=>o.type==='school'&&o.status==='active'),[organizations]);
  const q = schoolQuery.trim().toLowerCase();
  const hits = q?schools.filter(s=>`${s.schoolName ?? s.name} ${schoolPlace(s)}`.toLowerCase().includes(q)):schools.slice(0,5);
  const school = schools.find(s=>s.id===schoolId);
  const canNext = step===1?!!school:step===2?!!name.trim():true;
  const next=()=>{ if (canNext) { setStep(s=>Math.min(3,s+1)); window.scrollTo({ top:0 }); } };
  const back=()=>setStep(s=>Math.max(1,s-1));
  const finish=()=>onFinish(name.trim(),school);
  return <div className="page narrow">
    <div className="progress" aria-hidden="true">{[1,2,3].map(n=><div key={n} className={n<=step?'on':''}/>)}</div>
    <p className="step-label">Steg {step} av 3 · {['Skole','Om deg','Elevrådsvalg'][step-1]}</p>
    {step===1&&<>
      <div className="card">
        <h1>Finn skolen din</h1>
        <p className="muted">Søk opp skolen du går på. Elevrådet ditt blir koblet til den.</p>
        <SearchField size="sm" value={schoolQuery} onChange={setSchoolQuery} label="Søk etter skole" placeholder="Søk etter skole"/>
        <div className="hits">
          {hits.map(s=><button key={s.id} className={`hit ${s.id===schoolId?'on':''}`} aria-pressed={s.id===schoolId} onClick={()=>setSchoolId(s.id)}>
            <Avatar initials={s.initials} size="sm"/>
            <span className="grow"><span className="name">{s.schoolName ?? s.name}</span><span className="sub">{schoolPlace(s)}</span></span>
            <span className="tick">{s.id===schoolId?'Valgt':''}</span>
          </button>)}
          {!hits.length&&<p className="empty-note">Fant ikke skolen. Be elevrådet ta kontakt med fylkeslaget, så legges den inn.</p>}
        </div>
        <button className="btn primary large wide" aria-disabled={!canNext} onClick={next}>Fortsett</button>
      </div>
      <div className="card cool">
        <div className="grow" style={{ minWidth:180 }}><strong>Logg inn med Feide</strong><p className="muted">Kommer senere</p></div>
        <button className="btn" disabled>Ikke tilgjengelig</button>
      </div>
    </>}
    {step===2&&<div className="card">
      <h1>Om deg</h1>
      <p className="muted">{school?`${school.schoolName ?? school.name} · ${schoolPlace(school)}`:'Ingen skole valgt'}</p>
      <label className="field"><span>Navn</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Fornavn og etternavn" autoComplete="name"/></label>
      <div className="field">
        <span>Logg inn med</span>
        <div className="toggle-pair" role="group" aria-label="Innloggingsmetode">
          <button className={contactType==='tlf'?'on':''} aria-pressed={contactType==='tlf'} onClick={()=>setContactType('tlf')}>Telefonnummer</button>
          <button className={contactType==='epost'?'on':''} aria-pressed={contactType==='epost'} onClick={()=>setContactType('epost')}>E-post</button>
        </div>
        <input value={contact} onChange={e=>setContact(e.target.value)} aria-label={contactType==='tlf'?'Telefonnummer':'E-post'} type={contactType==='tlf'?'tel':'email'} placeholder={contactType==='tlf'?'+47 400 00 000':'navn@skole.no'}/>
        <small>Vi sender en engangskode hit for å bekrefte at det er deg.</small>
      </div>
      <div className="actions"><button className="btn large" onClick={back}>Tilbake</button><button className="btn primary large grow" aria-disabled={!canNext} onClick={next}>Fortsett</button></div>
    </div>}
    {step===3&&<div className="card">
      <h1>Når velger elevrådet ny leder?</h1>
      <p className="muted">Valgfritt. Vi bruker det til å minne elevrådet på å oppdatere hvem som har tilgang.</p>
      <label className="field"><span>Måned</span><select value={month} onChange={e=>setMonth(e.target.value)}><option value="">Vet ikke ennå</option>{leaderMonths.map(m=><option key={m} value={m.toLowerCase()}>{m}</option>)}</select></label>
      <div className="summary-box">
        <strong>{name.trim()||'Du'} · {school?.schoolName ?? 'ingen skole'}</strong>
        <p>{contactType==='tlf'?'Telefon: ':'E-post: '}{contact.trim()||'ikke fylt ut'}{month?` · Nytt ledervalg i ${month}`:''}</p>
      </div>
      <div className="actions"><button className="btn large" onClick={back}>Tilbake</button><button className="btn primary large grow" onClick={finish}>Fullfør innlogging</button></div>
      <button className="quiet" onClick={finish}>Hopp over</button>
    </div>}
  </div>;
}

// ---------- Composer ----------
function Composer({open,onClose,onPublish}:{open:boolean;onClose:()=>void;onPublish:(post:Post)=>void}) {
  const { activeRep, notify } = useApp();
  const [text,setText] = useState('');
  const [withPoll,setWithPoll] = useState(false);
  const [withImage,setWithImage] = useState(false);
  const [options,setOptions] = useState(['','','']);
  const [audience,setAudience] = useState<Audience>('public');
  const reset=()=>{ setText(''); setWithPoll(false); setWithImage(false); setOptions(['','','']); setAudience('public'); };
  const publish=()=>{
    const body=text.trim();
    if (!activeRep.canPublish) return;
    if (!body) { notify('Skriv noe før du publiserer'); return; }
    const pollOptions=options.map(o=>o.trim()).filter(Boolean);
    if (withPoll&&pollOptions.length<2) { notify('En avstemning trenger minst to svaralternativer'); return; }
    onPublish({
      id:`post-${Date.now()}`, organizationId:activeRep.organizationId, initials:activeRep.initials, organizationName:activeRep.name,
      actorName:currentUser.name, actorRole:activeRep.publicRole, createdAt:'Akkurat nå', body, audience, likes:0, comments:0, commentItems:[],
      media:withImage?[{ id:`m-${Date.now()}`, type:'image', alt:'foto: lastet opp av elevrådet' }]:undefined,
      poll:withPoll?{ question:body.split('\n')[0], closesAt:'om 14 dager', resultsVisibility:'after_vote', options:pollOptions.map((label,i)=>({ id:String(i), label, votes:0 })) }:undefined,
    });
    reset();
  };
  const publisherKind = activeRep.type==='school'?'elevrådet':activeRep.type==='county_board'?'fylkeslaget':activeRep.type==='local_board'?'lokallaget':'EO';
  return <Modal open={open} onClose={onClose} labelledBy="composer-title">
    <div className="modal-head"><h2 id="composer-title">Nytt innlegg</h2><button className="close-btn" aria-label="Lukk" onClick={onClose}>×</button></div>
    <div className="modal-body">
      <div className="publisher"><Avatar initials={activeRep.initials} size="lg" tone={activeRep.type==='school'?'navy':'coral'}/><div><strong>{activeRep.name}</strong><p className="sub">Publiseres av {publisherKind} · {currentUser.name}</p></div></div>
      {!activeRep.canPublish&&<p className="warn-box">{activeRep.name} har ikke gitt deg publiseringsrett. Bytt representasjon under Profil for å publisere.</p>}
      <textarea value={text} onChange={e=>setText(e.target.value)} aria-label="Tekst" placeholder={`Hva har ${publisherKind} jobbet med?`} maxLength={6000}/>
      <div className="dash-grid">
        <button className={`dash-btn ${withPoll?'on':''}`} aria-pressed={withPoll} onClick={()=>setWithPoll(v=>!v)}><span className="dot"/>{withPoll?'Poll lagt til · trykk for å fjerne':'Legg til poll'}</button>
        <button className={`dash-btn ${withImage?'on':''}`} aria-pressed={withImage} onClick={()=>setWithImage(v=>!v)}><span className="square"/>{withImage?'Bilde lagt til · trykk for å fjerne':'Legg til bilde'}</button>
      </div>
      {withPoll&&<div className="poll-inputs">{options.map((value,i)=><input key={i} value={value} aria-label={`Svaralternativ ${i+1}`} placeholder={`Svaralternativ ${i+1}${i===2?' (valgfritt)':''}`} onChange={e=>setOptions(all=>all.map((o,j)=>j===i?e.target.value:o))}/>)}</div>}
    </div>
    <div className="modal-foot">
      <label className="field"><span>Synlig for</span><select value={audience} onChange={e=>setAudience(e.target.value as Audience)}>{(['public','county','friends'] as Audience[]).map(a=><option key={a} value={a}>{audienceLabel[a]}</option>)}</select></label>
      <button className="btn" onClick={onClose}>Avbryt</button>
      <button className="btn primary lifted" disabled={!activeRep.canPublish} onClick={publish}>Publiser</button>
    </div>
  </Modal>;
}

function NotFound() {
  const { go } = useApp();
  return <div className="page"><h1>Fant ikke siden</h1><p className="muted">Lenken kan være utdatert.</p><button className="back-btn" onClick={()=>go({ view:'feed' })}>← Til forsiden</button></div>;
}
