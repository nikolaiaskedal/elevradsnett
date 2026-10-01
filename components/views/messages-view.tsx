import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/app-context';
import { useService } from '@/components/service-provider';
import { formatFileSize, prepareMessageAttachment } from '@/components/shared/message-files';
import { Avatar, ConfirmButton, SearchField } from '@/components/shared/ui';
import { initialsOf, kindLabel } from '@/lib/domain/labels';
import { reportCategoryLabel, type BlockedUser, type Conversation, type ConversationMember, type Message, type MessageAttachment, type OrganizationContact, type RecipientSearchResult, type ReportCategory } from '@/lib/domain/messaging';
import { errorMessage, GROUP_NAME_MAX_LENGTH, MESSAGE_ATTACHMENT_MAX_COUNT, MESSAGE_ATTACHMENT_TYPES, MESSAGE_MAX_LENGTH, REPORT_TEXT_MAX_LENGTH } from '@/lib/domain/validation';

type Panel = { kind:'chat' } | { kind:'organization'; id:string } | { kind:'new-group' } | { kind:'settings' };
type Person = { id:string; name:string; schoolName?:string };

export type MessagesViewProps = {
  conversations:Conversation[];
  setConversations:React.Dispatch<React.SetStateAction<Conversation[]>>;
  /** Henter samtalelisten på nytt fra serveren. */
  refresh:()=>Promise<Conversation[]>;
  selectedId:string;
  onSelect:(id:string)=>void;
  error?:string;
  /** Satt når brukeren kom fra «Kontakt» på en organisasjonsside. */
  contactOrganizationId?:string|null;
  onContactHandled?:()=>void;
};

const subtitle = (c:Conversation)=>c.kind==='direct'?'Direktemelding':c.kind==='managed'?`Gruppe for alle med verv · ${c.members} medlemmer`:`Gruppe · ${c.members} medlemmer`;

/** Meldinger (§9): alltid mellom personer. Organisasjoner har ingen innboks; søk etter en organisasjon viser kontaktpersonene. */
export function MessagesView({conversations,setConversations,refresh,selectedId,onSelect,error,contactOrganizationId,onContactHandled}:MessagesViewProps) {
  const service = useService();
  const { notify } = useApp();
  const [search,setSearch] = useState('');
  const [results,setResults] = useState<RecipientSearchResult[]>([]);
  const [panel,setPanel] = useState<Panel>({ kind:'chat' });
  // På mobil vises enten listen eller samtalen.
  const [mobileOpen,setMobileOpen] = useState(false);
  const q = search.trim().toLowerCase();
  const hits = conversations.filter(c=>!q||c.name.toLowerCase().includes(q));
  const active = conversations.find(c=>c.id===selectedId) ?? (panel.kind==='chat'?conversations[0]:undefined);

  useEffect(()=>{
    if (!contactOrganizationId) return;
    setPanel({ kind:'organization', id:contactOrganizationId });
    setMobileOpen(true);
    onContactHandled?.();
  },[contactOrganizationId,onContactHandled]);

  // Søk etter personer og organisasjoner på serveren, med litt forsinkelse mens brukeren skriver.
  useEffect(()=>{
    if (q.length<2) { setResults([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(()=>{
      service.searchRecipients(q).then(list=>{ if (!cancelled) setResults(list); }).catch(e=>{ if (!cancelled) notify(errorMessage(e)); });
    },250);
    return ()=>{ cancelled = true; window.clearTimeout(timer); };
  },[q,service,notify]);

  const open = useCallback((id:string)=>{ onSelect(id); setPanel({ kind:'chat' }); setMobileOpen(true); },[onSelect]);
  /** Etter at en samtale er opprettet: hent listen på nytt og åpne den. */
  const openNew = useCallback(async (id:string)=>{ await refresh(); setSearch(''); open(id); },[refresh,open]);
  const startDirect = (person:Person)=>{ service.startDirectConversation(person.id).then(openNew).catch(e=>notify(errorMessage(e))); };
  const showPanel = (next:Panel)=>{ setPanel(next); setMobileOpen(true); };

  const people = results.filter((r):r is Extract<RecipientSearchResult,{ kind:'person' }>=>r.kind==='person');
  const orgs = results.filter((r):r is Extract<RecipientSearchResult,{ kind:'organization' }>=>r.kind==='organization');

  return <div className="page" style={{ gap:16 }}>
    <h1>Meldinger</h1>
    {error&&<p className="warn-box" role="alert">Kunne ikke hente samtalene: {error}</p>}
    <div className={`messages ${mobileOpen?'chat-open':''}`}>
      <div className="convo-list">
        <SearchField size="sm" value={search} onChange={setSearch} label="Søk etter personer, elevråd eller fylkeslag" placeholder="Søk person, elevråd eller fylkeslag"/>
        <div className="convo-tools">
          <button className={`btn small ${panel.kind==='new-group'?'soft-on':''}`} onClick={()=>showPanel({ kind:'new-group' })}>Ny gruppe</button>
          <button className={`btn small ${panel.kind==='settings'?'soft-on':''}`} onClick={()=>showPanel({ kind:'settings' })}>Innstillinger</button>
        </div>
        {q&&<p className="chip-label">Samtaler</p>}
        {!hits.length&&<p className="empty-note">{q?'Ingen samtaler med dette navnet.':'Du har ingen samtaler ennå. Søk etter en person, et elevråd eller et fylkeslag for å starte.'}</p>}
        {hits.map(c=><button key={c.id} className={`convo ${panel.kind==='chat'&&c.id===active?.id?'on':''}`} aria-current={panel.kind==='chat'&&c.id===active?.id} onClick={()=>open(c.id)}>
          <Avatar initials={c.initials} tone={c.kind==='direct'?'pale':'navy'}/>
          <span className="grow"><span className="name">{c.name}{c.muted&&<span className="muted-tag">Dempet</span>}</span>
            <span className="preview">{c.lastMessage?`${c.lastMessage.mine?'Du: ':''}${c.lastMessage.text}`:'Ingen meldinger ennå'}</span></span>
          {c.unread>0&&<span className={`unread ${c.muted?'quiet-count':''}`} aria-label={`${c.unread} uleste`}>{c.unread}</span>}
        </button>)}
        {q.length>=2&&<>
          <p className="chip-label">Personer</p>
          {!people.length&&<p className="empty-note">Fant ingen personer.</p>}
          {people.map(p=><button key={p.id} className="convo" onClick={()=>startDirect(p)}>
            <Avatar initials={initialsOf(p.name)} tone="pale"/>
            <span className="grow"><span className="name">{p.name}</span><span className="preview">{p.schoolName ?? 'Send melding'}</span></span>
          </button>)}
          <p className="chip-label">Elevråd og styrer</p>
          {!orgs.length&&<p className="empty-note">Fant ingen elevråd eller styrer.</p>}
          {orgs.map(o=><button key={o.id} className={`convo ${panel.kind==='organization'&&panel.id===o.id?'on':''}`} onClick={()=>showPanel({ kind:'organization', id:o.id })}>
            <Avatar initials={initialsOf(o.name)}/>
            <span className="grow"><span className="name">{o.name}</span><span className="preview">{o.type==='national'?'Nasjonalt':`${kindLabel[o.type]} · ${o.county}`}</span></span>
          </button>)}
        </>}
      </div>
      <div className="chat">
        <button className="quiet chat-back" onClick={()=>setMobileOpen(false)}>← Alle samtaler</button>
        {panel.kind==='organization'
          ?<OrganizationPanel key={panel.id} organizationId={panel.id} onStart={startDirect} onCreated={id=>void openNew(id)}/>
          :panel.kind==='new-group'
            ?<NewGroupPanel onCreated={id=>void openNew(id)}/>
            :panel.kind==='settings'
              ?<SettingsPanel/>
              :active
                ?<ChatPanel key={active.id} conversation={active} setConversations={setConversations} refresh={refresh} onLeft={()=>{ onSelect(''); setMobileOpen(false); }}/>
                :<p className="chat-empty">Velg en samtale, eller søk etter en person for å starte en ny.</p>}
      </div>
    </div>
  </div>;
}

function ChatPanel({conversation,setConversations,refresh,onLeft}:{conversation:Conversation;setConversations:MessagesViewProps['setConversations'];refresh:MessagesViewProps['refresh'];onLeft:()=>void}) {
  const service = useService();
  const { go, notify } = useApp();
  const [messages,setMessages] = useState<Message[]|null>(null);
  const [loadError,setLoadError] = useState('');
  const [draft,setDraft] = useState('');
  const [files,setFiles] = useState<File[]>([]);
  const [busy,setBusy] = useState(false);
  const [showMembers,setShowMembers] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const lastAt = conversation.lastMessage?.createdAt;
  const unread = conversation.unread;

  // Hentes på nytt når det kommer en ny melding (sanntid oppdaterer samtalelisten).
  useEffect(()=>{
    let cancelled = false;
    service.listMessages({ conversationId:conversation.id }).then(list=>{
      if (cancelled) return;
      setMessages(list); setLoadError('');
    }).catch(e=>{ if (!cancelled) setLoadError(errorMessage(e)); });
    return ()=>{ cancelled = true; };
  },[service,conversation.id,lastAt]);
  useEffect(()=>{
    if (!unread || !messages) return;
    service.markConversationRead(conversation.id)
      .then(()=>setConversations(all=>all.map(c=>c.id===conversation.id?{ ...c, unread:0 }:c)))
      .catch(e=>notify(errorMessage(e)));
  },[unread,messages,service,conversation.id,setConversations,notify]);
  useEffect(()=>{ log.current?.scrollTo({ top:log.current.scrollHeight }); },[messages]);

  const pickFiles = async (list:FileList|null)=>{
    if (!list?.length) return;
    try {
      const prepared = await Promise.all([...list].map(prepareMessageAttachment));
      setFiles(current=>{
        const next = [...current,...prepared];
        if (next.length>MESSAGE_ATTACHMENT_MAX_COUNT) notify(`Du kan legge ved maks ${MESSAGE_ATTACHMENT_MAX_COUNT} filer.`);
        return next.slice(0,MESSAGE_ATTACHMENT_MAX_COUNT);
      });
    } catch (e) { notify(errorMessage(e)); }
    if (fileInput.current) fileInput.current.value = '';
  };
  const send = async ()=>{
    const text = draft.trim();
    if ((!text && !files.length) || busy) return;
    setBusy(true);
    try {
      const message = await service.sendMessage({ conversationId:conversation.id, body:text, attachments:files });
      setMessages(all=>[...(all ?? []),message]);
      setConversations(all=>{
        const updated = all.map(c=>c.id===conversation.id?{ ...c, lastMessage:{ text:text || 'Vedlegg', time:message.time, mine:true, createdAt:message.createdAt } }:c);
        return [...updated.filter(c=>c.id===conversation.id),...updated.filter(c=>c.id!==conversation.id)];
      });
      setDraft(''); setFiles([]);
    } catch (e) { notify(errorMessage(e)); }
    setBusy(false);
  };
  const act = async (action:()=>Promise<void>,done:string)=>{
    try { await action(); notify(done); return true; } catch (e) { notify(errorMessage(e)); return false; }
  };
  const toggleMute = ()=>void act(()=>service.setConversationMuted({ conversationId:conversation.id, muted:!conversation.muted }),conversation.muted?'Varsler er slått på igjen':'Samtalen er dempet')
    .then(ok=>{ if (ok) setConversations(all=>all.map(c=>c.id===conversation.id?{ ...c, muted:!c.muted }:c)); });
  const leave = ()=>void act(()=>service.leaveConversation(conversation.id),'Du har forlatt gruppen').then(async ok=>{ if (ok) { await refresh(); onLeft(); } });
  const block = ()=>{ if (conversation.otherUserId) void act(()=>service.blockUser(conversation.otherUserId!),`${conversation.name} er blokkert`).then(ok=>{ if (ok) void refresh(); }); };
  const hide = (m:Message)=>void act(()=>service.hideMessage(m.id),'Meldingen er slettet for deg').then(ok=>{ if (ok) { setMessages(all=>(all ?? []).filter(x=>x.id!==m.id)); void refresh(); } });

  return <>
    <div className="chat-head">
      <Avatar initials={conversation.initials} tone={conversation.kind==='direct'?'pale':'navy'}/>
      <div className="grow">
        {conversation.organizationId?<button className="name-link" onClick={()=>go({ view:'organization', id:conversation.organizationId! })}>{conversation.name}</button>:<strong>{conversation.name}</strong>}
        <p className="sub">{subtitle(conversation)}</p>
      </div>
      <div className="chat-actions">
        <button className="btn small" aria-pressed={conversation.muted} onClick={toggleMute}>{conversation.muted?'Slå på varsler':'Demp'}</button>
        {conversation.kind!=='direct'&&<button className={`btn small ${showMembers?'soft-on':''}`} aria-expanded={showMembers} onClick={()=>setShowMembers(v=>!v)}>Medlemmer</button>}
        {conversation.kind==='group'&&<ConfirmButton label="Forlat" question="Forlate gruppen?" confirmLabel="Forlat" onConfirm={leave}/>}
        {conversation.kind==='direct'&&conversation.otherUserId&&<ConfirmButton label="Blokker" question={`Blokkere ${conversation.name}?`} confirmLabel="Blokker" onConfirm={block}/>}
      </div>
    </div>
    {showMembers&&<MembersPanel conversation={conversation} onChanged={()=>void refresh()}/>}
    {conversation.kind==='managed'&&<p className="chat-note">Gruppen følger vervene: nye medlemmer ser meldinger fra de ble med, og den som går av, mister tilgangen.</p>}
    <div className="chat-log" ref={log} aria-live="polite">
      {loadError&&<p className="warn-box" role="alert">Kunne ikke hente meldingene: {loadError}</p>}
      {messages?.map(m=><MessageBubble key={m.id} message={m} showSender={conversation.kind!=='direct'} onHide={()=>hide(m)}/>)}
      {messages&&!messages.length&&<p className="chat-empty">Skriv den første meldingen til {conversation.name}.</p>}
    </div>
    <form className="chat-form" onSubmit={e=>{ e.preventDefault(); void send(); }}>
      {files.length>0&&<ul className="attach-list" aria-label="Vedlegg som sendes">
        {files.map((f,i)=><li key={`${f.name}-${i}`} className="chip">{f.name} ({formatFileSize(f.size)})
          <button type="button" className="chip-remove" aria-label={`Fjern ${f.name}`} onClick={()=>setFiles(all=>all.filter((_,j)=>j!==i))}>×</button></li>)}
      </ul>}
      <div className="chat-form-row">
        <input ref={fileInput} id={`attach-${conversation.id}`} className="sr-only" type="file" multiple accept={MESSAGE_ATTACHMENT_TYPES.join(',')} onChange={e=>void pickFiles(e.target.files)}/>
        <label htmlFor={`attach-${conversation.id}`} className="btn attach-button" aria-label="Legg ved bilde eller PDF" title="Legg ved bilde eller PDF">+</label>
        <input value={draft} onChange={e=>setDraft(e.target.value)} maxLength={MESSAGE_MAX_LENGTH} aria-label="Skriv en melding" placeholder="Skriv en melding …"/>
        <button className="btn primary" disabled={busy}>Send</button>
      </div>
    </form>
  </>;
}

function MessageBubble({message,showSender,onHide}:{message:Message;showSender:boolean;onHide:()=>void}) {
  const service = useService();
  const { notify } = useApp();
  const [menu,setMenu] = useState(false);
  const [reporting,setReporting] = useState(false);
  const [category,setCategory] = useState<ReportCategory>('harassment');
  const [description,setDescription] = useState('');
  const report = async ()=>{
    try {
      await service.reportMessage({ messageId:message.id, category, description:description.trim() || undefined });
      notify('Meldingen er rapportert. Bare denne meldingen deles med moderatorene.');
      setReporting(false); setMenu(false); setDescription('');
    } catch (e) { notify(errorMessage(e)); }
  };
  return <div className={`bubble-row ${message.mine?'mine':''}`}>
    <div className="bubble">
      {showSender&&!message.mine&&<strong className="bubble-from">{message.from}</strong>}
      {message.text&&<p>{message.text}</p>}
      {message.attachments.map(a=><AttachmentView key={a.id} attachment={a}/>)}
      <time dateTime={message.createdAt}>{message.time}{message.mine&&message.readBy!=null&&message.readBy>0?` · ${showSender?`Lest av ${message.readBy}`:'Lest'}`:''}</time>
    </div>
    <div className="bubble-menu">
      <button className="quiet small-quiet" aria-expanded={menu} aria-label="Valg for meldingen" onClick={()=>{ setMenu(v=>!v); setReporting(false); }}>⋯</button>
      {menu&&<div className="bubble-options">
        <button className="btn small" onClick={()=>{ setMenu(false); onHide(); }}>Slett for meg</button>
        {!message.mine&&<button className="btn small" aria-expanded={reporting} onClick={()=>setReporting(v=>!v)}>Rapporter</button>}
      </div>}
      {reporting&&<form className="report-form" onSubmit={e=>{ e.preventDefault(); void report(); }}>
        <p className="sub">Bare denne meldingen deles med moderatorene, ikke resten av samtalen.</p>
        <label className="field"><span>Hva gjelder det?</span>
          <select value={category} onChange={e=>setCategory(e.target.value as ReportCategory)}>
            {(Object.keys(reportCategoryLabel) as ReportCategory[]).map(c=><option key={c} value={c}>{reportCategoryLabel[c]}</option>)}
          </select></label>
        <label className="field"><span>Beskrivelse (valgfritt)</span><textarea rows={2} value={description} maxLength={REPORT_TEXT_MAX_LENGTH} onChange={e=>setDescription(e.target.value)}/></label>
        <div className="actions"><button className="btn primary small">Send rapport</button><button type="button" className="btn small" onClick={()=>setReporting(false)}>Avbryt</button></div>
      </form>}
    </div>
  </div>;
}

/** Vedlegg hentes med en tidsbegrenset lenke først når meldingen vises. */
function AttachmentView({attachment}:{attachment:MessageAttachment}) {
  const service = useService();
  const [url,setUrl] = useState<string|null>(null);
  const [failed,setFailed] = useState(false);
  useEffect(()=>{
    let cancelled = false;
    service.getAttachmentUrl(attachment.path).then(u=>{ if (!cancelled) setUrl(u); }).catch(()=>{ if (!cancelled) setFailed(true); });
    return ()=>{ cancelled = true; };
  },[service,attachment.path]);
  const label = `${attachment.fileName} (${formatFileSize(attachment.byteSize)})`;
  if (failed) return <p className="attachment">Vedlegget kunne ikke åpnes: {attachment.fileName}</p>;
  if (!url) return <p className="attachment">Henter {attachment.fileName} …</p>;
  if (attachment.mimeType.startsWith('image/')) return <a className="attachment-image" href={url} target="_blank" rel="noreferrer"><img src={url} alt={attachment.fileName}/></a>;
  return <a className="attachment" href={url} target="_blank" rel="noreferrer">PDF: {label}</a>;
}

function MembersPanel({conversation,onChanged}:{conversation:Conversation;onChanged:()=>void}) {
  const service = useService();
  const { notify } = useApp();
  const [members,setMembers] = useState<ConversationMember[]|null>(null);
  const [adding,setAdding] = useState<Person[]>([]);
  const load = useCallback(()=>{ service.listConversationMembers(conversation.id).then(setMembers).catch(e=>notify(errorMessage(e))); },[service,conversation.id,notify]);
  useEffect(load,[load]);
  const add = async ()=>{
    try {
      await service.addConversationMembers({ conversationId:conversation.id, userIds:adding.map(p=>p.id) });
      notify(adding.length===1?`${adding[0].name} er lagt til`:`${adding.length} personer er lagt til`);
      setAdding([]); load(); onChanged();
    } catch (e) { notify(errorMessage(e)); }
  };
  return <div className="members-panel">
    <ul className="member-list">
      {members?.map(m=><li key={m.userId}><span className="name">{m.name}{m.me?' (deg)':''}</span><span className="sub">{[m.schoolName,m.isAdmin?'Gruppeadministrator':''].filter(Boolean).join(' · ')}</span></li>)}
    </ul>
    {conversation.kind==='group'&&conversation.isAdmin&&<div className="add-members">
      <PersonPicker label="Legg til personer" selected={adding} onChange={setAdding} exclude={members?.map(m=>m.userId) ?? []}/>
      {adding.length>0&&<button className="btn primary small" onClick={()=>void add()}>Legg til</button>}
      <p className="sub">Nye medlemmer ser bare meldinger fra de blir lagt til.</p>
    </div>}
  </div>;
}

/** Søk etter personer (navn og skole) og velg én eller flere. */
function PersonPicker({label,selected,onChange,exclude = []}:{label:string;selected:Person[];onChange:(people:Person[])=>void;exclude?:string[]}) {
  const service = useService();
  const { notify } = useApp();
  const [query,setQuery] = useState('');
  const [hits,setHits] = useState<Person[]>([]);
  const q = query.trim();
  useEffect(()=>{
    if (q.length<2) { setHits([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(()=>{
      service.searchRecipients(q).then(list=>{ if (!cancelled) setHits(list.flatMap(r=>r.kind==='person'?[{ id:r.id, name:r.name, schoolName:r.schoolName }]:[])); })
        .catch(e=>{ if (!cancelled) notify(errorMessage(e)); });
    },250);
    return ()=>{ cancelled = true; window.clearTimeout(timer); };
  },[q,service,notify]);
  const available = hits.filter(p=>!selected.some(s=>s.id===p.id) && !exclude.includes(p.id));
  return <div className="person-picker">
    <label className="field"><span>{label}</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Søk etter navn"/></label>
    {selected.length>0&&<ul className="attach-list" aria-label="Valgte personer">
      {selected.map(p=><li key={p.id} className="chip on">{p.name}<button type="button" className="chip-remove" aria-label={`Fjern ${p.name}`} onClick={()=>onChange(selected.filter(s=>s.id!==p.id))}>×</button></li>)}
    </ul>}
    {q.length>=2&&<ul className="picker-hits">
      {!available.length&&<li className="empty-note">Fant ingen flere personer.</li>}
      {available.map(p=><li key={p.id}><button type="button" className="convo" onClick={()=>{ onChange([...selected,p]); setQuery(''); }}>
        <span className="grow"><span className="name">{p.name}</span><span className="preview">{p.schoolName ?? ''}</span></span><span className="sub">Velg</span>
      </button></li>)}
    </ul>}
  </div>;
}

function NewGroupPanel({onCreated}:{onCreated:(id:string)=>void}) {
  const service = useService();
  const { notify } = useApp();
  const [name,setName] = useState('');
  const [people,setPeople] = useState<Person[]>([]);
  const [busy,setBusy] = useState(false);
  const create = async ()=>{
    setBusy(true);
    try { onCreated(await service.createGroup({ name, memberIds:people.map(p=>p.id) })); notify('Gruppen er opprettet'); }
    catch (e) { notify(errorMessage(e)); }
    setBusy(false);
  };
  return <form className="side-panel" onSubmit={e=>{ e.preventDefault(); void create(); }}>
    <h2>Ny gruppe</h2>
    <p className="sub">Grupper er mellom personer. Du blir gruppeadministrator og kan legge til flere senere.</p>
    <label className="field"><span>Navn på gruppen</span><input value={name} onChange={e=>setName(e.target.value)} maxLength={GROUP_NAME_MAX_LENGTH} placeholder="F.eks. Planlegging av elevrådsuka"/></label>
    <PersonPicker label="Medlemmer" selected={people} onChange={setPeople}/>
    <div className="actions"><button className="btn primary" disabled={busy}>Opprett gruppe</button></div>
  </form>;
}

/** Organisasjoner har ingen innboks (§9). Her vises kontaktpersonene, og brukeren kan starte en gruppe med dem. */
function OrganizationPanel({organizationId,onStart,onCreated}:{organizationId:string;onStart:(person:Person)=>void;onCreated:(id:string)=>void}) {
  const service = useService();
  const { notify, go, org } = useApp();
  const [contacts,setContacts] = useState<OrganizationContact[]|null>(null);
  const [name,setName] = useState(org(organizationId)?.name ?? '');
  const [busy,setBusy] = useState(false);
  useEffect(()=>{
    let cancelled = false;
    service.listOrganizationContacts(organizationId).then(list=>{ if (!cancelled) setContacts(list); }).catch(e=>notify(errorMessage(e)));
    if (!org(organizationId)) service.getOrganization(organizationId).then(o=>{ if (!cancelled && o) setName(o.name); }).catch(()=>{});
    return ()=>{ cancelled = true; };
  },[service,organizationId,org,notify]);
  const others = contacts?.filter(c=>!c.me) ?? [];
  const createGroup = async ()=>{
    setBusy(true);
    try { onCreated(await service.createOrganizationGroup(organizationId)); notify('Gruppen er opprettet'); }
    catch (e) { notify(errorMessage(e)); }
    setBusy(false);
  };
  return <div className="side-panel">
    <h2><button className="name-link" onClick={()=>go({ view:'organization', id:organizationId })}>{name || 'Organisasjonen'}</button></h2>
    <p className="sub">Organisasjoner har ingen felles innboks. Send melding til en av kontaktpersonene, eller start en gruppe med dem.</p>
    {contacts===null?<p className="empty-note">Henter kontaktpersoner …</p>
      :!contacts.length?<p className="empty-note">Organisasjonen har ingen offentlige kontaktpersoner ennå.</p>
      :<ul className="member-list">
        {contacts.map(c=><li key={c.userId}>
          <span className="grow"><span className="name">{c.name}{c.me?' (deg)':''}</span><span className="sub">{c.publicTitle}</span></span>
          {!c.me&&<button className="btn small" onClick={()=>onStart({ id:c.userId, name:c.name })}>Send melding</button>}
        </li>)}
      </ul>}
    {others.length>0&&<div className="actions"><button className="btn primary" disabled={busy} onClick={()=>void createGroup()}>Opprett gruppe med {others.length===1?'kontaktpersonen':`alle ${others.length} kontaktpersonene`}</button></div>}
  </div>;
}

function SettingsPanel() {
  const service = useService();
  const { notify } = useApp();
  const [readReceipts,setReadReceipts] = useState<boolean|null>(null);
  const [blocked,setBlocked] = useState<BlockedUser[]>([]);
  useEffect(()=>{
    service.getMessageSettings().then(s=>setReadReceipts(s.readReceipts)).catch(e=>notify(errorMessage(e)));
    service.listBlockedUsers().then(setBlocked).catch(e=>notify(errorMessage(e)));
  },[service,notify]);
  const toggle = async (enabled:boolean)=>{
    try { await service.setReadReceipts(enabled); setReadReceipts(enabled); notify(enabled?'Lest-status er slått på':'Lest-status er slått av'); }
    catch (e) { notify(errorMessage(e)); }
  };
  const unblock = async (u:BlockedUser)=>{
    try { await service.unblockUser(u.userId); setBlocked(all=>all.filter(x=>x.userId!==u.userId)); notify(`Blokkeringen av ${u.name} er opphevet`); }
    catch (e) { notify(errorMessage(e)); }
  };
  return <div className="side-panel">
    <h2>Innstillinger for meldinger</h2>
    <div className="check-row">
      <input id="read-receipts" type="checkbox" checked={!!readReceipts} disabled={readReceipts===null} aria-describedby="read-receipts-help" onChange={e=>void toggle(e.target.checked)}/>
      <label htmlFor="read-receipts"><strong>Lest-status</strong><span id="read-receipts-help" className="sub">Vis når meldingene dine er lest. Du ser bare lest-status fra andre som også har slått den på.</span></label>
    </div>
    <h3>Blokkerte personer</h3>
    {!blocked.length?<p className="empty-note">Du har ikke blokkert noen. Blokkerte personer kan ikke sende deg direktemeldinger, og meldingene deres skjules i grupper.</p>
      :<ul className="member-list">{blocked.map(u=><li key={u.userId}><span className="grow name">{u.name}</span><button className="btn small" onClick={()=>void unblock(u)}>Opphev blokkering</button></li>)}</ul>}
  </div>;
}
