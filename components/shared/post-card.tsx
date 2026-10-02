import { useRef, useState } from 'react';
import { useApp } from '@/components/app-context';
import { audienceLabel, formatNumber, initialsOf } from '@/components/format';
import { EventMini } from '@/components/shared/event-mini';
import { PostHistoryDialog } from '@/components/shared/post-history';
import { Avatar, CommentIcon, Modal, ShareIcon, SupportIcon } from '@/components/shared/ui';
import { schoolLevelLabel } from '@/lib/domain/labels';
import { reportCategoryLabel, type ReportCategory } from '@/lib/domain/messaging';
import type { Post, PostMedia } from '@/lib/domain/types';
import { errorMessage } from '@/lib/domain/validation';

/** Innleggskort. preview viser kortet uten meny, slik det blir seende ut (forhåndsvisning i publiseringsdialogen). */
export function PostCard({post,plain,preview}:{post:Post;plain?:boolean;preview?:boolean}) {
  const { signedIn, currentUser, events, org, go, activeRep, liked, openComments, drafts, toggleLike, toggleComments, setDraft, sendComment, vote, share, report, requireLogin, editPost, deletePost } = useApp();
  const [menuOpen,setMenuOpen] = useState(false);
  const [historyOpen,setHistoryOpen] = useState(false);
  const [reportOpen,setReportOpen] = useState(false);
  const [confirmDelete,setConfirmDelete] = useState(false);
  const menuWrap = useRef<HTMLDivElement>(null);
  const closeMenuOutside = (e:React.FocusEvent)=>{ if (!menuWrap.current?.contains(e.relatedTarget as Node|null)) setMenuOpen(false); };
  const author = org(post.organizationId);
  const isLiked = liked.includes(post.id);
  const commentsOpen = openComments.includes(post.id);
  const linkedEvent = post.eventId?events.find(e=>e.id===post.eventId):undefined;
  // Bare offentlige innlegg kan deles (§7). Avgrenset innhold skal aldri få en lenke som ser offentlig ut.
  const shareable = post.audience==='public';
  const openOrg=()=>go({ view:'organization', id:post.organizationId });
  const openReport=()=>requireLogin('Logg inn for å rapportere innlegget.',()=>setReportOpen(true));
  return <article className={`post ${plain?'plain':''}`}>
    <div className="post-head">
      <button className="post-avatar" onClick={openOrg} aria-label={`Åpne ${post.organizationName}`}><Avatar initials={post.initials} size="lg" tone={author?.type==='national'?'coral':'navy'} orgType={author?.type}/></button>
      <div className="who">
        <button className="name-link" onClick={openOrg}>{post.organizationName}</button>
        <p className="sub">{post.actorName || 'Tidligere tillitsvalgt'} · {preview?post.createdAt:<button className="time-link" aria-label={`Åpne innlegget, publisert ${post.createdAt}`} onClick={()=>go({ view:'post', id:post.id })}>{post.createdAt}</button>}{post.edited?' · redigert':''}</p>
      </div>
      {!preview&&<div className="post-more-wrap" ref={menuWrap}>
        <button className="post-more" aria-label="Flere valg" aria-haspopup="menu" aria-expanded={menuOpen} onClick={()=>setMenuOpen(v=>!v)} onBlur={closeMenuOutside} onKeyDown={e=>{ if (e.key==='Escape') setMenuOpen(false); }}>···</button>
        {menuOpen&&<div className="menu" role="menu" tabIndex={-1} onBlur={closeMenuOutside} onKeyDown={e=>{ if (e.key==='Escape') setMenuOpen(false); }}>
          {shareable&&<button role="menuitem" onClick={()=>{ setMenuOpen(false); share(post); }}>Del innlegget</button>}
          <button role="menuitem" onClick={()=>{ setMenuOpen(false); openReport(); }}>Rapporter innlegg</button>
          {post.canManage&&<>
            <button role="menuitem" onClick={()=>{ setMenuOpen(false); editPost(post); }}>Rediger innlegg</button>
            {post.edited&&<button role="menuitem" onClick={()=>{ setMenuOpen(false); setHistoryOpen(true); }}>Vis endringshistorikk</button>}
            <button role="menuitem" className="danger-item" onClick={()=>{ setMenuOpen(false); setConfirmDelete(true); }}>Slett innlegg</button>
          </>}
        </div>}
      </div>}
    </div>
    <p className="post-body">{post.body}</p>
    {!!post.media?.length&&<div className={`post-media count-${Math.min(post.media.length,4)}`}>{post.media.map(m=><MediaItem key={m.id} media={m}/>)}</div>}
    {linkedEvent&&!plain&&<div className="post-event"><EventMini event={linkedEvent} flat/></div>}
    {post.poll&&<PollView post={post} canVote={!preview} onVote={optionId=>vote(post.id,optionId)} voterName={activeRep?.name}/>}
    <div className="post-actions">
      <button className={`action ${isLiked?'on':''}`} aria-pressed={isLiked} aria-label={`Støtt innlegget, ${post.likes+(isLiked?1:0)} støtter`} onClick={()=>toggleLike(post.id)}><SupportIcon/>{post.likes+(isLiked?1:0)}</button>
      <button className={`action ${commentsOpen?'on':''}`} aria-expanded={commentsOpen} aria-label={`Kommentarer, ${post.comments}`} onClick={()=>toggleComments(post.id)}><CommentIcon/>{post.comments}</button>
      {shareable&&<button className="action" aria-label="Del innlegget" onClick={()=>share(post)}><ShareIcon/></button>}
      {(post.audience!=='public' || (post.schoolLevel && post.schoolLevel!=='both'))&&<span className="audience-tag">
        {[post.audience!=='public'?audienceLabel[post.audience]:'',post.schoolLevel && post.schoolLevel!=='both'?schoolLevelLabel[post.schoolLevel]:''].filter(Boolean).join(' · ')}
      </span>}
    </div>
    {commentsOpen&&<div className="comments">
      {(post.commentItems ?? []).map(c=><div className="comment" key={c.id}>
        <Avatar size="sm" tone="pale" initials={org(c.organizationId)?.initials ?? initialsOf(c.organizationName)} orgType={org(c.organizationId)?.type}/>
        <div className="comment-bubble"><strong>{c.organizationName}</strong><span className="time"> · {c.createdAt}</span><p>{c.body}</p></div>
      </div>)}
      {activeRep&&currentUser?<form className="comment-form" onSubmit={e=>{ e.preventDefault(); sendComment(post.id); }}>
        <Avatar size="sm" initials={currentUser.initials} src={currentUser.avatarUrl}/>
        <input value={drafts[post.id] ?? ''} onChange={e=>setDraft(post.id,e.target.value)} aria-label="Skriv en kommentar" placeholder={`Skriv en kommentar som ${activeRep.name} …`}/>
        <button className="btn primary">Send</button>
      </form>
      :signedIn?<p className="comment-note">Kommentarer skrives på vegne av et elevråd eller styre. Du trenger et verv for å kommentere.</p>
      :<button className="btn small comment-login" onClick={()=>requireLogin('Logg inn for å kommentere.')}>Logg inn for å kommentere</button>}
    </div>}
    {historyOpen&&<PostHistoryDialog post={post} onClose={()=>setHistoryOpen(false)}/>}
    {reportOpen&&<ReportDialog post={post} onClose={()=>setReportOpen(false)} onSend={input=>report(post,input)}/>}
    <Modal open={confirmDelete} onClose={()=>setConfirmDelete(false)} labelledBy={`delete-${post.id}`} width={440}>
      <div className="modal-head"><h2 id={`delete-${post.id}`}>Slette innlegget?</h2><button className="close-btn" aria-label="Lukk" onClick={()=>setConfirmDelete(false)}>×</button></div>
      <div className="modal-body"><p className="muted">Innlegget og bildene fjernes fra feeden og fra siden til {post.organizationName}. Det kan ikke angres.</p></div>
      <div className="modal-foot">
        <button className="btn" onClick={()=>setConfirmDelete(false)}>Avbryt</button>
        <button className="btn danger" onClick={()=>{ setConfirmDelete(false); deletePost(post); }}>Slett innlegget</button>
      </div>
    </Modal>
  </article>;
}

/** Et bilde i innlegget. Behandlingsstatus vises for bilder som ikke er klare (bare de som kan endre innlegget ser dem). */
function MediaItem({media}:{media:PostMedia}) {
  if (media.status==='pending') return <div className="media-ph" role="img" aria-label={`${media.alt || 'Bilde'}, behandles`}><span className="media-label">Bildet kontrolleres av serveren …</span></div>;
  if (media.status==='failed') return <div className="media-ph" role="img" aria-label={`${media.alt || 'Bilde'}, avvist`}><span className="media-label">Bildet ble avvist og vises ikke</span></div>;
  if (!media.url) return <div className="media-ph" role="img" aria-label={media.alt}><span className="media-label">{media.alt}</span></div>;
  return <img className="media-img" src={media.url} alt={media.alt} loading="lazy" width={media.width} height={media.height}/>;
}

/** Avstemning (§7): én stemme per organisasjon, som kan endres til fristen. Resultatet vises etter stemme eller frist. */
function PollView({post,canVote,onVote,voterName}:{post:Post;canVote:boolean;onVote:(optionId:string)=>void;voterName?:string}) {
  const poll = post.poll!;
  const show = !!poll.showResults || poll.resultsVisibility==='always';
  const total = poll.totalVotes ?? poll.options.reduce((n,o)=>n+o.votes,0);
  const open = !poll.closed && canVote;
  return <div className="poll">
    <p className="poll-question">{poll.question}</p>
    <div className="poll-options" role="group" aria-label={poll.question}>
      {poll.options.map(o=>{ const pct = total?Math.round(o.votes/total*100):0; const mine = poll.myVote===o.id;
        return <button key={o.id} className={`poll-option ${mine?'chosen':''}`} aria-pressed={mine} disabled={!open} aria-label={show?`${o.label}, ${pct} %`:o.label} onClick={()=>onVote(o.id)}>
          <span className="poll-fill" style={{ width:show?`${pct}%`:0 }}/>
          <span className="poll-label"><span>{o.label}{mine?' ✓':''}</span><em>{show?`${pct}%`:''}</em></span>
        </button>; })}
    </div>
    <p className="poll-foot">
      {poll.closed?'Avstemningen er avsluttet':`Frist: ${poll.closesAt}`}
      {show?` · ${formatNumber(total)} ${total===1?'stemme':'stemmer'} fra elevråd og styrer`:' · Resultatet vises når dere har stemt'}
      {poll.myVote&&!poll.closed?` · ${voterName ?? 'Dere'} har stemt og kan endre stemmen til fristen`:''}
    </p>
  </div>;
}

function ReportDialog({post,onClose,onSend}:{post:Post;onClose:()=>void;onSend:(input:{ category:ReportCategory; description?:string })=>Promise<void>}) {
  const [category,setCategory] = useState<ReportCategory>('inappropriate');
  const [description,setDescription] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const send = async()=>{
    setBusy(true); setError('');
    try { await onSend({ category, description:description.trim() || undefined }); onClose(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return <Modal open onClose={onClose} labelledBy={`report-${post.id}`} width={460}>
    <div className="modal-head"><h2 id={`report-${post.id}`}>Rapporter innlegg</h2><button className="close-btn" aria-label="Lukk" onClick={onClose}>×</button></div>
    <div className="modal-body">
      <p className="muted">Rapporten går til moderatorene. {post.organizationName} får ikke vite hvem som rapporterte.</p>
      <label className="field"><span>Hva gjelder det?</span>
        <select value={category} onChange={e=>setCategory(e.target.value as ReportCategory)}>
          {(Object.keys(reportCategoryLabel) as ReportCategory[]).map(c=><option key={c} value={c}>{reportCategoryLabel[c]}</option>)}
        </select>
      </label>
      <label className="field"><span>Beskrivelse (valgfritt)</span><textarea value={description} maxLength={1000} onChange={e=>setDescription(e.target.value)}/></label>
      {error&&<p className="form-error" role="alert">{error}</p>}
    </div>
    <div className="modal-foot">
      <button className="btn" onClick={onClose}>Avbryt</button>
      <button className="btn primary" disabled={busy} onClick={()=>void send()}>Send rapport</button>
    </div>
  </Modal>;
}
