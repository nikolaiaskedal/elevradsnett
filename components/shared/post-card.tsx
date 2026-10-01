import { useRef, useState } from 'react';
import { useApp } from '@/components/app-context';
import { audienceLabel, formatNumber, initialsOf } from '@/components/format';
import { EventMini } from '@/components/shared/event-mini';
import { PostHistoryDialog } from '@/components/shared/post-history';
import { Avatar, CommentIcon, Modal, ShareIcon, SupportIcon } from '@/components/shared/ui';
import { schoolLevelLabel } from '@/lib/domain/labels';
import type { Post } from '@/lib/domain/types';

/** Innleggskort. preview viser kortet uten meny, slik det blir seende ut (forhåndsvisning i publiseringsdialogen). */
export function PostCard({post,plain,preview}:{post:Post;plain?:boolean;preview?:boolean}) {
  const { signedIn, currentUser, events, org, go, activeRep, liked, openComments, drafts, votes, toggleLike, toggleComments, setDraft, sendComment, vote, share, report, requireLogin, editPost, deletePost } = useApp();
  const [menuOpen,setMenuOpen] = useState(false);
  const [historyOpen,setHistoryOpen] = useState(false);
  const [confirmDelete,setConfirmDelete] = useState(false);
  const menuWrap = useRef<HTMLDivElement>(null);
  const closeMenuOutside = (e:React.FocusEvent)=>{ if (!menuWrap.current?.contains(e.relatedTarget as Node|null)) setMenuOpen(false); };
  const author = org(post.organizationId);
  const isLiked = liked.includes(post.id);
  const commentsOpen = openComments.includes(post.id);
  const linkedEvent = post.eventId?events.find(e=>e.id===post.eventId):undefined;
  const openOrg=()=>go({ view:'organization', id:post.organizationId });
  return <article className={`post ${plain?'plain':''}`}>
    <div className="post-head">
      <button className="post-avatar" onClick={openOrg} aria-label={`Åpne ${post.organizationName}`}><Avatar initials={post.initials} size="lg" tone={author?.type==='national'?'coral':'navy'} orgType={author?.type}/></button>
      <div className="who">
        <button className="name-link" onClick={openOrg}>{post.organizationName}</button>
        <p className="sub">{post.actorName || 'Tidligere tillitsvalgt'} · {post.createdAt}{post.edited?' · redigert':''}</p>
      </div>
      {!preview&&<div className="post-more-wrap" ref={menuWrap}>
        <button className="post-more" aria-label="Flere valg" aria-haspopup="menu" aria-expanded={menuOpen} onClick={()=>setMenuOpen(v=>!v)} onBlur={closeMenuOutside} onKeyDown={e=>{ if (e.key==='Escape') setMenuOpen(false); }}>···</button>
        {menuOpen&&<div className="menu" role="menu" tabIndex={-1} onBlur={closeMenuOutside} onKeyDown={e=>{ if (e.key==='Escape') setMenuOpen(false); }}>
          <button role="menuitem" onClick={()=>{ setMenuOpen(false); share(post); }}>Del innlegget</button>
          <button role="menuitem" onClick={()=>{ setMenuOpen(false); report(post); }}>Rapporter innlegg</button>
          {post.canManage&&<>
            <button role="menuitem" onClick={()=>{ setMenuOpen(false); editPost(post); }}>Rediger innlegg</button>
            {post.edited&&<button role="menuitem" onClick={()=>{ setMenuOpen(false); setHistoryOpen(true); }}>Vis endringshistorikk</button>}
            <button role="menuitem" className="danger-item" onClick={()=>{ setMenuOpen(false); setConfirmDelete(true); }}>Slett innlegg</button>
          </>}
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
    <Modal open={confirmDelete} onClose={()=>setConfirmDelete(false)} labelledBy={`delete-${post.id}`} width={440}>
      <div className="modal-head"><h2 id={`delete-${post.id}`}>Slette innlegget?</h2><button className="close-btn" aria-label="Lukk" onClick={()=>setConfirmDelete(false)}>×</button></div>
      <div className="modal-body"><p className="muted">Innlegget fjernes fra feeden og fra siden til {post.organizationName}. Det kan ikke angres.</p></div>
      <div className="modal-foot">
        <button className="btn" onClick={()=>setConfirmDelete(false)}>Avbryt</button>
        <button className="btn danger" onClick={()=>{ setConfirmDelete(false); deletePost(post); }}>Slett innlegget</button>
      </div>
    </Modal>
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
