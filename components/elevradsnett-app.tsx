import { useCallback, useEffect, useRef, useState } from 'react';
import { AppContext, type App } from '@/components/app-context';
import { routeHash, legalPages, parseHash, type Route } from '@/components/routing';
import { useService } from '@/components/service-provider';
import { Composer } from '@/components/shared/composer';
import { LoginDialog, LoginGate } from '@/components/shared/login-dialog';
import { OnboardingFlow } from '@/components/shared/login-flow';
import { RepresentationSwitcher } from '@/components/shared/representation-switcher';
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
import type { Conversation, Event, EventResponse, Organization, Post, Representation, Session } from '@/lib/domain/types';
import { errorMessage } from '@/lib/domain/validation';

declare global { interface Document { modelContext?: { registerTool:(tool:{name:string;title?:string;description:string;inputSchema:object;annotations?:{readOnlyHint?:boolean;untrustedContentHint?:boolean};execute:(input:unknown)=>unknown},options?:{signal?:AbortSignal})=>void|Promise<void> } } }

type Loaded = { session:Session; events:Event[] };
type LoginRequest = { reason?:string; then?:(app:App)=>void };

/** Sider som bare gir mening innlogget. Alt annet kan leses uten innlogging (§1). */
const gated:Partial<Record<Route['view'],{ title:string; text:string }>> = {
  messages:{ title:'Meldinger', text:'Meldinger er personlige. Logg inn for å se samtalene dine.' },
  profile:{ title:'Profil', text:'Logg inn for å se og endre profilen din.' },
  admin:{ title:'Administrasjon', text:'Logg inn for å administrere organisasjonene du har ansvar for.' },
};

const sessionKey = (s:Session)=>s.status==='active'||s.status==='deactivated'?`${s.status}:${s.user.id}`:s.status;

export default function ElevradsnettApp() {
  const service = useService();
  const [route,setRoute] = useState<Route>({ view:'feed' });
  const [loaded,setLoaded] = useState<Loaded|null>(null);
  const [loadError,setLoadError] = useState('');
  const [reloadKey,setReloadKey] = useState(0);
  const [loadedKey,setLoadedKey] = useState(-1);
  const [activeRepId,setActiveRepId] = useState<string|null>(null);
  const [organizations,setOrganizations] = useState<Organization[]>([]);
  const [posts,setPosts] = useState<Post[]>([]);
  const [liked,setLiked] = useState<string[]>([]);
  const [openComments,setOpenComments] = useState<string[]>([]);
  const [drafts,setDrafts] = useState<Record<string,string>>({});
  const [votes,setVotes] = useState<Record<string,string>>({});
  const [responses,setResponses] = useState<Record<string,EventResponse|undefined>>({});
  const [query,setQuery] = useState('');
  const [conversations,setConversations] = useState<Conversation[]>([]);
  const [conversationsError,setConversationsError] = useState('');
  const [conversationId,setConversationId] = useState('');
  const [contactOrganizationId,setContactOrganizationId] = useState<string|null>(null);
  const [composerOpen,setComposerOpen] = useState(false);
  const [login,setLogin] = useState<LoginRequest|null>(null);
  const [toast,setToast] = useState('');
  const pending = useRef<((app:App)=>void)|null>(null);
  const currentKey = useRef('');
  const returnTo = useRef<Route>({ view:'feed' });

  useEffect(()=>{
    let cancelled = false;
    (async()=>{
      const session = await service.getSession();
      const signedIn = session.status==='active';
      const repId = signedIn?session.activeRepresentationId:null;
      const [orgs,feed,events] = await Promise.all([
        service.listOrganizations(),
        service.listFeed({ representationId:repId, mode:'chronological' }),
        service.listEvents(),
      ]);
      if (cancelled) return;
      currentKey.current = sessionKey(session);
      setLoaded({ session, events });
      setLoadError('');
      setActiveRepId(repId);
      setOrganizations(orgs);
      setPosts(feed);
      setLiked(feed.filter(p=>p.supported).map(p=>p.id));
      setResponses({}); setVotes({});
      setConversations([]); setConversationsError(''); setConversationId(''); setContactOrganizationId(null);
      setLoadedKey(reloadKey);
      if (signedIn) {
        service.listConversations().then(convos=>{
          if (cancelled) return;
          setConversations(convos);
        }).catch(error=>{ if (!cancelled) setConversationsError(errorMessage(error)); });
      }
    })().catch(error=>{ if (!cancelled) setLoadError(errorMessage(error)); });
    return ()=>{ cancelled = true; };
  },[service,reloadKey]);

  const reload = useCallback(()=>setReloadKey(k=>k+1),[]);
  const clearContact = useCallback(()=>setContactOrganizationId(null),[]);
  const refreshConversations = useCallback(async ()=>{
    const convos = await service.listConversations();
    setConversations(convos); setConversationsError('');
    return convos;
  },[service]);

  // Innlogging eller utlogging i en annen fane, eller en økt som har utløpt.
  useEffect(()=>service.onSessionChange(()=>{
    service.getSession().then(session=>{ if (sessionKey(session)!==currentKey.current) reload(); }).catch(()=>{});
  }),[service,reload]);

  const session = loaded?.session ?? null;
  const signedIn = session?.status==='active';
  // Sanntid: nye meldinger oppdaterer samtalelisten og antall uleste, uansett hvilken side brukeren er på.
  useEffect(()=>{
    if (!signedIn) return;
    let timer = 0;
    const stop = service.subscribeToMessages(()=>{
      window.clearTimeout(timer);
      timer = window.setTimeout(()=>{ refreshConversations().catch(()=>{}); },300);
    });
    return ()=>{ window.clearTimeout(timer); stop(); };
  },[service,signedIn,refreshConversations]);
  const user = session&&(session.status==='active'||session.status==='deactivated')?session:null;
  const representations = user?.representations ?? [];
  const activeRep = signedIn?representations.find(r=>r.id===activeRepId) ?? null:null;
  const org = useCallback((id:string)=>organizations.find(o=>o.id===id),[organizations]);

  useEffect(()=>{
    const sync=()=>setRoute(parseHash(window.location.hash));
    sync();
    window.addEventListener('hashchange',sync);
    return ()=>window.removeEventListener('hashchange',sync);
  },[]);
  const go = useCallback((next:Route)=>{
    if (next.view==='login') returnTo.current = parseHash(window.location.hash);
    const hash=routeHash(next);
    if (window.location.hash!==hash) window.location.hash=hash; else setRoute(next);
    window.scrollTo({ top:0 });
  },[]);
  const notify = useCallback((text:string)=>{ setToast(text); window.setTimeout(()=>setToast(current=>current===text?'':current),2800); },[]);
  const fail = useCallback((error:unknown)=>notify(errorMessage(error)),[notify]);
  const toggle = (list:string[],id:string)=>list.includes(id)?list.filter(x=>x!==id):[...list,id];

  /** Etter innlogging: last data for den innloggede, og fortsett der brukeren var. */
  const signedInDone = useCallback((next:Session)=>{
    setLogin(null);
    if (next.status==='active') notify(`Du er logget inn som ${next.user.name}`);
    reload();
  },[notify,reload]);

  useEffect(()=>{
    const context=document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle=new AbortController();
    const views:Record<string,Route> = { feed:{view:'feed'}, explore:{view:'explore'}, events:{view:'events'}, messages:{view:'messages'}, profile:{view:'profile'}, admin:{view:'admin'} };
    const run=async()=>{
      await context.registerTool({ name:'navigate_elevradsnett', title:'Åpne side', description:'Åpner en hovedside i Elevrådsnett.', inputSchema:{ type:'object', properties:{ view:{ type:'string', enum:Object.keys(views) } }, required:['view'], additionalProperties:false }, annotations:{ readOnlyHint:true, untrustedContentHint:false },
        execute:input=>{ const value=(input as { view?:string }).view ?? ''; if (!views[value]) throw new Error('Ugyldig side'); go(views[value]); return { view:value }; } },{ signal:lifecycle.signal });
      if (activeRep) await context.registerTool({ name:'start_post_creation', title:'Start nytt innlegg', description:'Åpner publiseringsdialogen for aktiv representasjon.', inputSchema:{ type:'object', properties:{}, additionalProperties:false }, annotations:{ readOnlyHint:false, untrustedContentHint:false },
        execute:()=>{ if (!activeRep.canPublish) throw new Error('Aktiv representasjon har ikke publiseringsrett'); setComposerOpen(true); return { organization:activeRep.name, status:'composer_open' }; } },{ signal:lifecycle.signal });
    };
    void run().catch(()=>{});
    return ()=>lifecycle.abort();
  },[activeRep,go]);

  // Dempede samtaler teller ikke med i menyen.
  const unread = conversations.reduce((n,c)=>n+(c.muted?0:c.unread),0);
  const nav:{ label:string; route:Route; on:boolean; count?:number }[] = [
    { label:'Hjem', route:{ view:'feed' }, on:route.view==='feed' },
    { label:'Arrangementer', route:{ view:'events' }, on:route.view==='events'||route.view==='event' },
    { label:'Meldinger', route:{ view:'messages' }, on:route.view==='messages', count:unread },
    { label:'Profil', route:{ view:'profile' }, on:route.view==='profile' },
    ...(session&&session.status!=='anonymous'?[]:[{ label:'Logg inn', route:{ view:'login' } as Route, on:route.view==='login' }]),
  ];

  let page:React.ReactNode = null;
  let app:App|null = null;
  const schools = organizations;
  if (loadError) page=<div className="page"><h1>Kunne ikke laste Elevrådsnett</h1><p className="muted">{loadError}</p><button className="btn" onClick={reload}>Prøv igjen</button></div>;
  else if (loaded && session) {
    const currentUser = user?.user ?? null;
    /** Handlinger som krever innlogging åpner innloggingen først, og kjøres når brukeren er logget inn. */
    const needLogin = (reason:string,then:(a:App)=>void)=>{
      if (session.status==='deactivated') { notify('Profilen din er deaktivert. Du kan lese, men ikke gjøre endringer.'); return true; }
      if (signedIn) return false;
      pending.current = then;
      setLogin({ reason });
      return true;
    };
    /** Representasjonen handlingen gjøres på vegne av. Uten verv finnes det ingen å handle for. */
    const needRep = (what:string)=>{
      if (activeRep) return activeRep;
      notify(`Du må ha et verv i et elevråd eller styre for å ${what}.`);
      return null;
    };
    const sendComment = (postId:string)=>{
      if (needLogin('Logg inn for å kommentere.',a=>a.sendComment(postId))) return;
      const rep = needRep('kommentere');
      const body=(drafts[postId] ?? '').trim();
      if (!rep || !body) return;
      service.addComment({ postId, representationId:rep.id, body }).then(comment=>{
        setPosts(all=>all.map(p=>p.id===postId?{ ...p, comments:p.comments+1, commentItems:[...(p.commentItems ?? []),{ ...comment, organizationName:comment.organizationName || rep.name }] }:p));
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
    /** Feeden hentes for den nye representasjonen før byttet vises, så alt skifter samtidig. */
    const switchTo = (rep:Representation)=>{
      service.switchRepresentation(rep.id)
        .then(()=>service.listFeed({ representationId:rep.id, mode:'chronological' }))
        .then(feed=>{
          setActiveRepId(rep.id); setPosts(feed); setLiked(feed.filter(p=>p.supported).map(p=>p.id)); setResponses({}); setVotes({});
          notify(`Du representerer nå ${rep.name}`);
        }).catch(fail);
    };
    app = {
      session, signedIn, switchRepresentation:switchTo, currentUser, representations, events:loaded.events,
      organizations, posts, activeRep, responses, liked, openComments, drafts, votes, org, go, notify, reload,
      requireLogin:(reason,then)=>{ if (!needLogin(reason ?? 'Logg inn for å fortsette.',then ?? (()=>{}))) then?.(app!); },
      signOut:()=>{ service.signOut().then(()=>{ go({ view:'feed' }); notify('Du er logget ut'); reload(); }).catch(fail); },
      loadOrganizationPosts:id=>{
        service.listOrganizationPosts(id).then(list=>setPosts(all=>{
          const known=new Set(all.map(p=>p.id));
          setLiked(l=>[...new Set([...l,...list.filter(p=>p.supported).map(p=>p.id)])]);
          return [...all,...list.filter(p=>!known.has(p.id))];
        })).catch(fail);
      },
      toggleFollow:id=>{
        if (needLogin(`Logg inn for å følge ${org(id)?.name ?? 'organisasjonen'}.`,a=>{ if (!a.org(id)?.following) a.toggleFollow(id); })) return;
        const following=!org(id)?.following;
        service.setFollow({ organizationId:id, following }).then(()=>setOrganizations(all=>all.map(o=>o.id===id?{ ...o, following, followers:o.followers+(following?1:-1) }:o))).catch(fail);
      },
      toggleLike:id=>{
        if (needLogin('Logg inn for å støtte innlegget.',a=>{ if (!a.liked.includes(id)) a.toggleLike(id); })) return;
        service.setPostSupport({ postId:id, supported:!liked.includes(id) }).then(()=>setLiked(all=>toggle(all,id))).catch(fail);
      },
      toggleComments:id=>setOpenComments(all=>toggle(all,id)),
      setDraft:(id,text)=>setDrafts(all=>({ ...all, [id]:text })),
      sendComment, share:post=>void share(post),
      report:post=>{
        if (needLogin('Logg inn for å rapportere innlegget.',a=>a.report(post))) return;
        service.reportPost({ postId:post.id }).then(()=>notify('Innlegget er rapportert til moderatorene')).catch(fail);
      },
      vote:(postId,optionId)=>{
        if (needLogin('Logg inn for å stemme på vegne av elevrådet.',a=>a.vote(postId,optionId))) return;
        const rep = needRep('stemme');
        if (!rep) return;
        service.vote({ postId, optionId, organizationId:rep.organizationId }).then(()=>setVotes(all=>({ ...all, [postId]:optionId }))).catch(fail);
      },
      respond:(eventId,response)=>{
        if (needLogin('Logg inn for å svare på arrangementet.',a=>{ if (a.responses[eventId]!==response) a.respond(eventId,response); })) return;
        const rep = needRep('svare på arrangementer');
        if (!rep) return;
        const next=responses[eventId]===response?null:response;
        service.setEventResponse({ eventId, organizationId:rep.organizationId, response:next }).then(()=>setResponses(all=>({ ...all, [eventId]:next ?? undefined }))).catch(fail);
      },
      openComposer:()=>{
        if (needLogin('Logg inn for å publisere for elevrådet ditt.',a=>a.openComposer())) return;
        if (needRep('publisere innlegg')) setComposerOpen(true);
      },
    };
    /** Organisasjoner har ingen innboks (§9): Meldinger viser kontaktpersonene og tilbud om en gruppe. */
    const openConversationWith = (o:Organization)=>{
      const show = ()=>{ setContactOrganizationId(o.id); go({ view:'messages' }); };
      if (needLogin(`Logg inn for å kontakte ${o.name}.`,show)) return;
      show();
    };
    const gate = gated[route.view];
    if (session.status==='onboarding' && route.view!=='legal') {
      page=<div className="page narrow"><OnboardingFlow schools={schools} email={session.email} onDone={signedInDone} onSignOut={app.signOut}/></div>;
    } else if (gate && session.status==='anonymous') {
      page=<LoginGate title={gate.title} text={gate.text} schools={schools} onDone={signedInDone}/>;
    } else if (gate && session.status==='deactivated') {
      page=<div className="page narrow"><h1>{gate.title}</h1><p className="warn-box">Profilen din er deaktivert. Du kan fortsatt lese alt som er offentlig.</p><button className="btn" onClick={app.signOut}>Logg ut</button></div>;
    } else switch (route.view) {
      case 'explore': page=<ExploreView query={query} setQuery={setQuery}/>; break;
      case 'events': page=<EventsView/>; break;
      case 'event': page=<EventDetailView id={route.id}/>; break;
      case 'organization': page=<OrganizationView id={route.id} onContact={openConversationWith}/>; break;
      case 'messages': page=<MessagesView conversations={conversations} setConversations={setConversations} refresh={refreshConversations} selectedId={conversationId} onSelect={setConversationId} error={conversationsError}
        contactOrganizationId={contactOrganizationId} onContactHandled={clearContact}/>; break;
      case 'profile': page=<ProfileView/>; break;
      case 'login': page=<LoginView onDone={next=>{ signedInDone(next); go(returnTo.current.view==='login'?{ view:'feed' }:returnTo.current); }}/>; break;
      case 'admin': page=<AdminView/>; break;
      case 'legal': page=<LegalView page={route.page} onPage={p=>go({ view:'legal', page:p })}/>; break;
      default: page=<FeedView query={query} setQuery={setQuery}/>;
    }
  }

  // Etter innlogging: fortsett med handlingen brukeren prøvde på, med oppdatert tilstand.
  const appRef = useRef<App|null>(null);
  useEffect(()=>{
    appRef.current = app;
    if (!signedIn || loadedKey!==reloadKey || !pending.current || !appRef.current) return;
    const then = pending.current;
    pending.current = null;
    then(appRef.current);
  });

  const publish = (post:Post)=>{ setPosts(all=>[post,...all]); setComposerOpen(false); go({ view:'feed' }); notify(`Publisert som ${activeRep?.name ?? ''}`); };

  return <AppContext.Provider value={app}>
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <button className="logo-button" aria-label="Elevrådsnett, til forsiden" onClick={()=>go({ view:'feed' })}><Logo/></button>
          <nav className="main-nav" aria-label="Hovedmeny">
            {nav.map(item=><button key={item.label} className={`nav-link ${item.on?'on':''}`} aria-current={item.on?'page':undefined} onClick={()=>go(item.route)}>
              {item.label}{item.count?<span className="nav-count" aria-label={`${item.count} uleste`}>{item.count}</span>:null}
            </button>)}
          </nav>
          {app&&<RepresentationSwitcher/>}
          <button className="btn primary lifted" onClick={()=>app?.openComposer()}>Nytt innlegg</button>
        </div>
      </header>
      {session?.status==='deactivated'&&<p className="notice-bar">Profilen din er deaktivert. Du kan lese offentlig innhold, men ikke publisere, kommentere eller sende meldinger.</p>}
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
      {app&&activeRep&&<Composer open={composerOpen} onClose={()=>setComposerOpen(false)} onPublish={publish}/>}
      <LoginDialog open={!!login} reason={login?.reason} schools={schools} onClose={()=>{ setLogin(null); pending.current=null; reload(); }} onDone={signedInDone}/>
      {toast&&<div className="toast" role="status">{toast}</div>}
    </div>
  </AppContext.Provider>;
}
