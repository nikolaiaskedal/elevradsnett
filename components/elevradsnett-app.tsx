import { useCallback, useEffect, useState } from 'react';
import { AppContext, type App } from '@/components/app-context';
import { routeHash, legalPages, parseHash, type Route } from '@/components/routing';
import { useService } from '@/components/service-provider';
import { Composer } from '@/components/shared/composer';
import { Logo } from '@/components/shared/ui';
import { AdminView } from '@/components/views/admin-view';
import { EventDetailView } from '@/components/views/event-detail-view';
import { EventsView } from '@/components/views/events-view';
import { ExploreView } from '@/components/views/explore-view';
import { FeedView } from '@/components/views/feed-view';
import { LegalView } from '@/components/views/legal-view';
import { LoginView } from '@/components/views/login-view';
import { MessagesView } from '@/components/views/messages-view';
import { OrganizationView } from '@/components/views/organization-view';
import { ProfileView } from '@/components/views/profile-view';
import type { Conversation, CurrentUser, Event, EventResponse, Organization, Post, Representation } from '@/lib/domain/types';
import { errorMessage } from '@/lib/domain/validation';

declare global { interface Document { modelContext?: { registerTool:(tool:{name:string;title?:string;description:string;inputSchema:object;annotations?:{readOnlyHint?:boolean;untrustedContentHint?:boolean};execute:(input:unknown)=>unknown},options?:{signal?:AbortSignal})=>void|Promise<void> } } }

type Loaded = { currentUser:CurrentUser; representations:Representation[]; events:Event[] };

export default function ElevradsnettApp() {
  const service = useService();
  const [route,setRoute] = useState<Route>({ view:'feed' });
  const [loaded,setLoaded] = useState<Loaded|null>(null);
  const [loadError,setLoadError] = useState('');
  const [activeRepId,setActiveRepId] = useState('');
  const [organizations,setOrganizations] = useState<Organization[]>([]);
  const [posts,setPosts] = useState<Post[]>([]);
  const [liked,setLiked] = useState<string[]>([]);
  const [openComments,setOpenComments] = useState<string[]>([]);
  const [drafts,setDrafts] = useState<Record<string,string>>({});
  const [votes,setVotes] = useState<Record<string,string>>({});
  const [responses,setResponses] = useState<Record<string,EventResponse|undefined>>({});
  const [query,setQuery] = useState('');
  const [conversations,setConversations] = useState<Conversation[]>([]);
  const [conversationId,setConversationId] = useState('');
  const [composerOpen,setComposerOpen] = useState(false);
  const [toast,setToast] = useState('');

  useEffect(()=>{
    let cancelled = false;
    (async()=>{
      const session = await service.getSession();
      const [orgs,feed,events,convos] = await Promise.all([
        service.listOrganizations(),
        service.listFeed({ representationId:session.activeRepresentationId, mode:'chronological' }),
        service.listEvents(),
        service.listConversations(),
      ]);
      if (cancelled) return;
      setLoaded({ currentUser:session.user, representations:session.representations, events });
      setActiveRepId(session.activeRepresentationId);
      setOrganizations(orgs);
      setPosts(feed);
      setConversations(convos);
      setConversationId(convos[0]?.id ?? '');
    })().catch(error=>{ if (!cancelled) setLoadError(errorMessage(error)); });
    return ()=>{ cancelled = true; };
  },[service]);

  const representations = loaded?.representations ?? [];
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
  const fail = useCallback((error:unknown)=>notify(errorMessage(error)),[notify]);
  const toggle = (list:string[],id:string)=>list.includes(id)?list.filter(x=>x!==id):[...list,id];

  useEffect(()=>{
    const context=document.modelContext;
    if (!context?.registerTool || !activeRep) return;
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

  let page:React.ReactNode = null;
  let app:App|null = null;
  if (loadError) page=<div className="page"><h1>Kunne ikke laste Elevrådsnett</h1><p className="muted">{loadError}</p></div>;
  else if (loaded && activeRep) {
    const { currentUser } = loaded;
    const sendComment = (postId:string)=>{
      const body=(drafts[postId] ?? '').trim();
      if (!body) return;
      service.addComment({ postId, representationId:activeRep.id, body }).then(comment=>{
        setPosts(all=>all.map(p=>p.id===postId?{ ...p, comments:p.comments+1, commentItems:[...(p.commentItems ?? []),comment] }:p));
        setDrafts(all=>({ ...all, [postId]:'' }));
      }).catch(fail);
    };
    const share = async (post:Post)=>{
      const url=`${window.location.href.split('#')[0]}${routeHash({ view:'organization', id:post.organizationId })}`;
      const shareFn=(navigator as Navigator & { share?:(data:ShareData)=>Promise<void> }).share;
      try {
        if (shareFn) { await shareFn.call(navigator,{ title:`${post.organizationName} på Elevrådsnett`, text:post.body.slice(0,100), url }); }
        else { await navigator.clipboard.writeText(url); notify('Lenken er kopiert'); }
      } catch { /* Brukeren avbrøt delingen */ }
    };
    app = {
      currentUser, representations, events:loaded.events,
      organizations, posts, activeRep, responses, liked, openComments, drafts, votes, org, go, notify,
      toggleFollow:id=>{
        const following=!org(id)?.following;
        service.setFollow({ organizationId:id, following }).then(()=>setOrganizations(all=>all.map(o=>o.id===id?{ ...o, following, followers:o.followers+(following?1:-1) }:o))).catch(fail);
      },
      toggleLike:id=>{
        service.setPostSupport({ postId:id, supported:!liked.includes(id) }).then(()=>setLiked(all=>toggle(all,id))).catch(fail);
      },
      toggleComments:id=>setOpenComments(all=>toggle(all,id)),
      setDraft:(id,text)=>setDrafts(all=>({ ...all, [id]:text })),
      sendComment, share:post=>void share(post),
      report:post=>{ service.reportPost({ postId:post.id }).then(()=>notify('Innlegget er rapportert til moderatorene')).catch(fail); },
      vote:(postId,optionId)=>{
        service.vote({ postId, optionId, organizationId:activeRep.organizationId }).then(()=>setVotes(all=>({ ...all, [postId]:optionId }))).catch(fail);
      },
      respond:(eventId,response)=>{
        const next=responses[eventId]===response?null:response;
        service.setEventResponse({ eventId, organizationId:activeRep.organizationId, response:next }).then(()=>setResponses(all=>({ ...all, [eventId]:next ?? undefined }))).catch(fail);
      },
      openComposer:()=>setComposerOpen(true),
    };
    const openConversationWith = (o:Organization)=>{
      service.openConversation({ organizationId:o.id }).then(conversation=>{
        setConversations(all=>all.some(c=>c.id===conversation.id)?all:[conversation,...all]);
        setConversationId(conversation.id);
        go({ view:'messages' });
      }).catch(fail);
    };
    const switchTo = (rep:Representation)=>{
      service.switchRepresentation(rep.id).then(()=>{ setActiveRepId(rep.id); notify(`Du representerer nå ${rep.name}`); }).catch(fail);
    };
    switch (route.view) {
      case 'explore': page=<ExploreView query={query} setQuery={setQuery}/>; break;
      case 'events': page=<EventsView/>; break;
      case 'event': page=<EventDetailView id={route.id}/>; break;
      case 'organization': page=<OrganizationView id={route.id} onContact={openConversationWith}/>; break;
      case 'messages': page=<MessagesView conversations={conversations} setConversations={setConversations} selectedId={conversationId} onSelect={setConversationId}/>; break;
      case 'profile': page=<ProfileView onSwitch={switchTo}/>; break;
      case 'login': page=<LoginView onFinish={(name,school)=>{ go({ view:'feed' }); notify(`Velkommen, ${name || currentUser.name}! Du er koblet til ${school?.name ?? 'Elevrådsnett'}.`); }}/>; break;
      case 'admin': page=<AdminView activeRep={activeRep} onNotify={notify}/>; break;
      case 'legal': page=<LegalView page={route.page} onPage={p=>go({ view:'legal', page:p })}/>; break;
      default: page=<FeedView query={query} setQuery={setQuery}/>;
    }
  }
  const publish = (post:Post)=>{ setPosts(all=>[post,...all]); setComposerOpen(false); go({ view:'feed' }); notify(`Publisert som ${activeRep?.name ?? ''}`); };

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
      {app&&<Composer open={composerOpen} onClose={()=>setComposerOpen(false)} onPublish={publish}/>}
      {toast&&<div className="toast" role="status">{toast}</div>}
    </div>
  </AppContext.Provider>;
}
