import { useEffect, useState } from 'react';
import { useApp } from '@/components/app-context';
import { useService } from '@/components/service-provider';
import { Avatar, SearchField } from '@/components/shared/ui';
import type { Conversation } from '@/lib/domain/types';
import { errorMessage } from '@/lib/domain/validation';

export function MessagesView({conversations,setConversations,selectedId,onSelect,error}:{conversations:Conversation[];setConversations:React.Dispatch<React.SetStateAction<Conversation[]>>;selectedId:string;onSelect:(id:string)=>void;error?:string}) {
  const service = useService();
  const { go, notify, org } = useApp();
  const [search,setSearch] = useState('');
  const [draft,setDraft] = useState('');
  const q = search.trim().toLowerCase();
  const hits = conversations.filter(c=>!q||`${c.name} ${c.subtitle ?? ''}`.toLowerCase().includes(q));
  const active = conversations.find(c=>c.id===selectedId) ?? conversations[0];
  const unreadId = active?.unread ? active.id : undefined;
  useEffect(()=>{
    if (!unreadId) return;
    service.markConversationRead(unreadId)
      .then(()=>setConversations(all=>all.map(c=>c.id===unreadId?{ ...c, unread:0 }:c)))
      .catch(error=>notify(errorMessage(error)));
  },[unreadId,service,setConversations,notify]);
  const send=async()=>{
    const text=draft.trim();
    if (!text||!active) return;
    try {
      const message = await service.sendMessage({ conversationId:active.id, body:text });
      setConversations(all=>all.map(c=>c.id===active.id?{ ...c, messages:[...c.messages,message] }:c));
      setDraft('');
    } catch (error) { notify(errorMessage(error)); }
  };
  return <div className="page" style={{ gap:16 }}>
    <h1>Meldinger</h1>
    {error&&<p className="warn-box" role="alert">Kunne ikke hente samtalene: {error}</p>}
    <div className="messages">
      <div className="convo-list">
        <SearchField size="sm" value={search} onChange={setSearch} label="Søk i samtaler" placeholder="Søk elevråd eller fylkeslag"/>
        {!hits.length&&<p className="empty-note">{q?'Ingen treff. Prøv navnet på skolen eller fylkeslaget.':'Du har ingen samtaler ennå.'}</p>}
        {hits.map(c=><button key={c.id} className={`convo ${c.id===active?.id?'on':''}`} aria-current={c.id===active?.id} onClick={()=>onSelect(c.id)}>
          <Avatar initials={c.initials} orgType={c.organizationId?org(c.organizationId)?.type:undefined}/>
          <span className="grow"><span className="name">{c.name}</span><span className="preview">{c.messages.at(-1)?.text ?? 'Ingen meldinger ennå'}</span></span>
          {c.unread>0&&<span className="unread" aria-label={`${c.unread} uleste`}>{c.unread}</span>}
        </button>)}
      </div>
      {active&&<div className="chat">
        <div className="chat-head">
          <Avatar initials={active.initials} orgType={active.organizationId?org(active.organizationId)?.type:undefined}/>
          <div className="grow">{active.organizationId?<button className="name-link" onClick={()=>go({ view:'organization', id:active.organizationId! })}>{active.name}</button>:<strong>{active.name}</strong>}<p className="sub">{active.subtitle ?? `${active.members} deltakere`}</p></div>
        </div>
        <div className="chat-log" aria-live="polite">
          {active.messages.map(m=><div key={m.id} className={`bubble-row ${m.mine?'mine':''}`}><div className="bubble"><p>{m.text}</p><time>{m.time}</time></div></div>)}
          {!active.messages.length&&<p className="chat-empty">Skriv den første meldingen til {active.name}.</p>}
        </div>
        <form className="chat-form" onSubmit={e=>{ e.preventDefault(); void send(); }}>
          <input value={draft} onChange={e=>setDraft(e.target.value)} aria-label="Skriv en melding" placeholder="Skriv en melding …"/>
          <button className="btn primary">Send</button>
        </form>
      </div>}
    </div>
  </div>;
}
