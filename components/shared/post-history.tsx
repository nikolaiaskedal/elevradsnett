import { useEffect, useState } from 'react';
import { audienceLabel } from '@/components/format';
import { useService } from '@/components/service-provider';
import { Modal } from '@/components/shared/ui';
import { schoolLevelLabel } from '@/lib/domain/labels';
import { formatRelative } from '@/lib/domain/time';
import type { Post, PostRevision } from '@/lib/domain/types';
import { errorMessage } from '@/lib/domain/validation';

/** Endringshistorikken til et innlegg (§7). Serveren viser den bare for dem som kan redigere innlegget. */
export function PostHistoryDialog({post,onClose}:{post:Post;onClose:()=>void}) {
  const service = useService();
  const [revisions,setRevisions] = useState<PostRevision[]|null>(null);
  const [error,setError] = useState('');
  useEffect(()=>{
    let cancelled = false;
    service.listPostHistory(post.id).then(list=>{ if (!cancelled) setRevisions(list); }).catch(e=>{ if (!cancelled) setError(errorMessage(e)); });
    return ()=>{ cancelled = true; };
  },[service,post.id]);
  const titleId = `history-${post.id}`;
  return <Modal open onClose={onClose} labelledBy={titleId}>
    <div className="modal-head"><h2 id={titleId}>Endringshistorikk</h2><button className="close-btn" aria-label="Lukk" onClick={onClose}>×</button></div>
    <div className="modal-body">
      <p className="muted">Tidligere versjoner av innlegget fra {post.organizationName}, nyeste først. Bare administratorer ser historikken.</p>
      <div className="revision"><p className="revision-meta"><strong>Nå</strong> · {audienceLabel[post.audience]}{post.schoolLevel?` · ${schoolLevelLabel[post.schoolLevel]}`:''}</p><p className="revision-body">{post.body}</p></div>
      {error&&<p className="form-error" role="alert">{error}</p>}
      {!revisions&&!error&&<p className="muted">Henter …</p>}
      {revisions&&!revisions.length&&<p className="empty-note">Ingen tidligere versjoner.</p>}
      {revisions?.map(r=><div className="revision" key={r.id}>
        <p className="revision-meta"><strong>Endret {formatRelative(r.createdAt)}</strong>{r.editedByName?` av ${r.editedByName}`:''} · {audienceLabel[r.audience]} · {schoolLevelLabel[r.schoolLevel]}</p>
        <p className="revision-body">{r.body}</p>
      </div>)}
    </div>
    <div className="modal-foot"><button className="btn" onClick={onClose}>Lukk</button></div>
  </Modal>;
}
