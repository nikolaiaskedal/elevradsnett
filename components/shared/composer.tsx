import { useEffect, useState } from 'react';
import { useApp } from '@/components/app-context';
import { audienceLabel } from '@/components/format';
import { PostCard } from '@/components/shared/post-card';
import { Avatar, ConfirmButton, Modal } from '@/components/shared/ui';
import { useService } from '@/components/service-provider';
import { schoolLevelLabel } from '@/lib/domain/labels';
import { formatRelative } from '@/lib/domain/time';
import type { Audience, OrganizationType, Post, PostDraft, SchoolLevelTarget } from '@/lib/domain/types';
import { audiencesFor, cleanText, errorMessage, POST_MAX_LENGTH } from '@/lib/domain/validation';

const schoolLevels:SchoolLevelTarget[] = ['both','upper_secondary','lower_secondary'];
const publisherKindOf = (type:OrganizationType)=>type==='school'?'elevrådet':type==='county_board'?'fylkeslaget':type==='local_board'?'lokallaget':'EO';

/**
 * Nytt innlegg, utkast eller redigering av et publisert innlegg (§7). Avsenderen er aktiv representasjon,
 * eller organisasjonen som eier innlegget som redigeres. Serveren avgjør om brukeren får lov.
 * Lages på nytt (key) for hvert innlegg som redigeres, så tilstanden starter fra innlegget.
 */
export function Composer({open,editing,onClose,onPublished,onEdited}:{open:boolean;editing:Post|null;onClose:()=>void;onPublished:(post:Post)=>void;onEdited:(post:Post)=>void}) {
  const service = useService();
  const { currentUser, activeRep, events, org, notify } = useApp();
  const [text,setText] = useState(editing?.body ?? '');
  const [audience,setAudience] = useState<Audience>(editing?.audience ?? 'public');
  const [schoolLevel,setSchoolLevel] = useState<SchoolLevelTarget>(editing?.schoolLevel ?? 'both');
  const [eventId,setEventId] = useState(editing?.eventId ?? '');
  const [draftId,setDraftId] = useState<string|null>(null);
  const [withPoll,setWithPoll] = useState(false);
  const [withImage,setWithImage] = useState(false);
  const [options,setOptions] = useState(['','','']);
  const [preview,setPreview] = useState(false);
  const [drafts,setDrafts] = useState<PostDraft[]|null>(null);
  const [showDrafts,setShowDrafts] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');

  // Avsender: organisasjonen som eier innlegget, ellers aktiv representasjon.
  const senderId = editing?.organizationId ?? activeRep?.organizationId ?? '';
  const senderOrg = org(senderId);
  const senderType:OrganizationType = senderOrg?.type ?? activeRep?.type ?? 'school';
  const senderName = editing?.organizationName ?? activeRep?.name ?? '';
  const canPublish = !!editing || !!activeRep?.canPublish;
  const publisherKind = publisherKindOf(senderType);
  const audiences = audiencesFor(senderType,!!senderOrg?.localBoard);
  // Målgruppen må passe avsenderen; etter bytte av representasjon kan et tidligere valg ha blitt ugyldig.
  const chosenAudience = audiences.includes(audience)?audience:'public';
  const taggable = events.filter(e=>e.status==='published' || e.id===eventId);

  useEffect(()=>{
    if (!open || editing || !activeRep?.canPublish) return;
    let cancelled = false;
    service.listDrafts(activeRep.id).then(list=>{ if (!cancelled) setDrafts(list); }).catch(()=>{ if (!cancelled) setDrafts([]); });
    return ()=>{ cancelled = true; };
  },[service,open,editing,activeRep]);

  const reset=()=>{ setText(''); setAudience('public'); setSchoolLevel('both'); setEventId(''); setDraftId(null); setWithPoll(false); setWithImage(false); setOptions(['','','']); setPreview(false); setError(''); };
  const content=()=>({ body:text, audience:chosenAudience, schoolLevel, eventId:eventId || undefined });
  const pollOptions=options.map(o=>o.trim()).filter(Boolean);
  const run = async(work:()=>Promise<void>)=>{
    setBusy(true); setError('');
    try { await work(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  const publish=()=>run(async()=>{
    if (!cleanText(text)) throw new Error('Skriv noe før du publiserer.');
    if (editing) {
      onEdited(await service.editPost({ postId:editing.id, ...content() }));
      return;
    }
    if (!activeRep?.canPublish) return;
    if (withPoll&&pollOptions.length<2) throw new Error('En avstemning trenger minst to svaralternativer.');
    const post = await service.publishPost({ representationId:activeRep.id, draftId:draftId ?? undefined, ...content(), poll:withPoll?{ options:pollOptions }:undefined, withImage });
    onPublished(post);
    reset();
  });
  const saveDraft=()=>run(async()=>{
    if (!activeRep?.canPublish) return;
    if (!cleanText(text)) throw new Error('Skriv noe før du lagrer utkastet.');
    const saved = await service.saveDraft({ representationId:activeRep.id, draftId:draftId ?? undefined, ...content() });
    setDrafts(all=>[saved,...(all ?? []).filter(d=>d.id!==saved.id)]);
    notify('Utkastet er lagret');
    reset();
    onClose();
  });
  const openDraft=(d:PostDraft)=>{
    setText(d.body); setAudience(d.audience); setSchoolLevel(d.schoolLevel); setEventId(d.eventId ?? ''); setDraftId(d.id);
    setWithPoll(false); setWithImage(false); setShowDrafts(false); setPreview(false); setError('');
  };
  const deleteDraft=(d:PostDraft)=>run(async()=>{
    await service.deletePost(d.id);
    setDrafts(all=>(all ?? []).filter(x=>x.id!==d.id));
    if (draftId===d.id) reset();
    notify('Utkastet er slettet');
  });

  const previewPost:Post = {
    id:'forhandsvisning', organizationId:senderId, initials:senderOrg?.initials ?? activeRep?.initials ?? '', organizationName:senderName,
    actorName:currentUser?.name ?? '', actorRole:activeRep?.publicRole ?? '', createdAt:editing?editing.createdAt:'Akkurat nå', body:cleanText(text),
    audience:chosenAudience, schoolLevel, eventId:eventId || undefined, edited:editing?.edited, likes:0, comments:0,
    media:withImage?[{ id:'forhandsvisning-bilde', type:'image', alt:'Bilde' }]:undefined,
    poll:withPoll&&!editing?{ question:cleanText(text).split('\n')[0] ?? '', closesAt:'om 14 dager', options:pollOptions.map((label,i)=>({ id:String(i), label, votes:0 })) }:undefined,
  };
  const title = editing?'Rediger innlegg':draftId?'Rediger utkast':'Nytt innlegg';
  const draftCount = drafts?.length ?? 0;

  return <Modal open={open} onClose={onClose} labelledBy="composer-title">
    <div className="modal-head"><h2 id="composer-title">{title}</h2><button className="close-btn" aria-label="Lukk" onClick={onClose}>×</button></div>
    <div className="modal-body">
      <div className="publisher">
        <Avatar initials={previewPost.initials} size="lg" tone={senderType==='school'?'navy':'coral'}/>
        <div className="grow"><strong>{senderName}</strong><p className="sub">{editing?`Publisert av ${editing.actorName || 'tidligere tillitsvalgt'} · endres av ${currentUser?.name ?? ''}`:`Publiseres av ${publisherKind} · ${currentUser?.name ?? ''}`}</p></div>
        {!editing&&!!draftCount&&<button className="link" aria-expanded={showDrafts} onClick={()=>setShowDrafts(v=>!v)}>Utkast ({draftCount})</button>}
      </div>
      {!canPublish&&<p className="warn-box">{senderName} har ikke gitt deg publiseringsrett. Bytt representasjon under Profil for å publisere.</p>}
      {editing&&<p className="muted composer-note">Endringer merkes «redigert», og forrige versjon lagres i endringshistorikken.</p>}
      {showDrafts&&<div className="list" aria-label="Utkast">
        {(drafts ?? []).map(d=><div className="row-card draft-row" key={d.id}>
          <span className="grow"><strong>{d.body.split('\n')[0]}</strong><small>{audienceLabel[d.audience]} · lagret {formatRelative(d.updatedAt)}{d.actorName?` av ${d.actorName}`:''}</small></span>
          <button className="btn small" disabled={busy} onClick={()=>openDraft(d)}>Fortsett</button>
          <ConfirmButton label="Slett" question="Slette utkastet?" confirmLabel="Slett utkast" disabled={busy} onConfirm={()=>void deleteDraft(d)}/>
        </div>)}
      </div>}
      <div className="segmented" role="tablist" aria-label="Visning">
        <button role="tab" aria-selected={!preview} className={!preview?'on':''} onClick={()=>setPreview(false)}>Skriv</button>
        <button role="tab" aria-selected={preview} className={preview?'on':''} onClick={()=>setPreview(true)}>Forhåndsvis</button>
      </div>
      {preview
        ?<div className="composer-preview" inert>{previewPost.body?<PostCard post={previewPost} preview/>:<p className="empty-note">Skriv noe for å se hvordan innlegget blir.</p>}</div>
        :<>
          <textarea value={text} onChange={e=>setText(e.target.value)} aria-label="Tekst" placeholder={`Hva har ${publisherKind} jobbet med?`} maxLength={POST_MAX_LENGTH}/>
          {!editing&&<div className="dash-grid">
            <button className={`dash-btn ${withPoll?'on':''}`} aria-pressed={withPoll} onClick={()=>setWithPoll(v=>!v)}><span className="dot"/>{withPoll?'Poll lagt til · trykk for å fjerne':'Legg til poll'}</button>
            <button className={`dash-btn ${withImage?'on':''}`} aria-pressed={withImage} onClick={()=>setWithImage(v=>!v)}><span className="square"/>{withImage?'Bilde lagt til · trykk for å fjerne':'Legg til bilde'}</button>
          </div>}
          {withPoll&&<div className="poll-inputs">{options.map((value,i)=><input key={i} value={value} aria-label={`Svaralternativ ${i+1}`} placeholder={`Svaralternativ ${i+1}${i===2?' (valgfritt)':''}`} onChange={e=>setOptions(all=>all.map((o,j)=>j===i?e.target.value:o))}/>)}</div>}
          <label className="field"><span>Tagg arrangement</span>
            <select value={eventId} onChange={e=>setEventId(e.target.value)}>
              <option value="">Ingen</option>
              {taggable.map(e=><option key={e.id} value={e.id}>{e.title} · {e.start}</option>)}
            </select>
          </label>
        </>}
      {error&&<p className="form-error" role="alert">{error}</p>}
    </div>
    <div className="modal-foot">
      <label className="field"><span>Synlig for</span><select value={chosenAudience} onChange={e=>setAudience(e.target.value as Audience)}>{audiences.map(a=><option key={a} value={a}>{audienceLabel[a]}</option>)}</select></label>
      <label className="field"><span>Skoleform</span><select value={schoolLevel} onChange={e=>setSchoolLevel(e.target.value as SchoolLevelTarget)}>{schoolLevels.map(l=><option key={l} value={l}>{schoolLevelLabel[l]}</option>)}</select></label>
      <div className="composer-buttons">
        <button className="btn" onClick={onClose}>Avbryt</button>
        {!editing&&<button className="btn" disabled={!canPublish || busy || withPoll || withImage} title={withPoll||withImage?'Utkast kan ikke ha poll eller bilde ennå':undefined} onClick={()=>void saveDraft()}>Lagre utkast</button>}
        <button className="btn primary lifted" disabled={!canPublish || busy} onClick={()=>void publish()}>{editing?'Lagre endringer':'Publiser'}</button>
      </div>
    </div>
  </Modal>;
}
