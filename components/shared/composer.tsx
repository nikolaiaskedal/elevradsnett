import { useEffect, useState } from 'react';
import { useApp } from '@/components/app-context';
import { audienceLabel } from '@/components/format';
import { PostCard } from '@/components/shared/post-card';
import { Avatar, ConfirmButton, Modal } from '@/components/shared/ui';
import { useService } from '@/components/service-provider';
import { schoolLevelLabel } from '@/lib/domain/labels';
import { formatDayMonth, formatRelative } from '@/lib/domain/time';
import type { Audience, OrganizationType, Post, PostDraft, SchoolLevelTarget } from '@/lib/domain/types';

import { ALT_TEXT_MAX_LENGTH, audiencesFor, cleanText, errorMessage, isoDate, POLL_MAX_OPTIONS, POST_IMAGE_MAX_COUNT, POST_MAX_LENGTH } from '@/lib/domain/validation';
import { preparePostImage } from '@/components/shared/image';
import type { PublishProgress } from '@/lib/services/contracts';

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
  const [images,setImages] = useState<{ file:Blob; url:string; alt:string }[]>([]);
  const [preparing,setPreparing] = useState(false);
  const [progress,setProgress] = useState('');
  const [question,setQuestion] = useState('');
  const [closesOn,setClosesOn] = useState(()=>isoDate(new Date(Date.now()+14*24*3600*1000)));
  const [options,setOptions] = useState(['','','']);
  const withImage = images.length>0;
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

  const clearImages=()=>setImages(all=>{ all.forEach(i=>URL.revokeObjectURL(i.url)); return []; });
  const reset=()=>{ setText(''); setAudience('public'); setSchoolLevel('both'); setEventId(''); setDraftId(null); setWithPoll(false); clearImages(); setQuestion(''); setOptions(['','','']); setPreview(false); setError(''); setProgress(''); };
  /** Bildene kodes om i nettleseren før opplasting (EXIF og GPS forsvinner). Serveren kontrollerer dem etterpå. */
  const addImages=async(files:FileList|null)=>{
    if (!files?.length) return;
    setPreparing(true); setError('');
    try {
      const room = POST_IMAGE_MAX_COUNT-images.length;
      if (files.length>room) throw new Error(`Et innlegg kan ha maks ${POST_IMAGE_MAX_COUNT} bilder.`);
      const prepared = await Promise.all([...files].map(async f=>{ const file = await preparePostImage(f); return { file, url:URL.createObjectURL(file), alt:'' }; }));
      setImages(all=>[...all,...prepared]);
    } catch (e) { setError(errorMessage(e)); } finally { setPreparing(false); }
  };
  const removeImage=(index:number)=>setImages(all=>{ URL.revokeObjectURL(all[index].url); return all.filter((_,i)=>i!==index); });
  const progressText=(p:PublishProgress)=>p.step==='saving'?'Lagrer innlegget …':p.step==='publishing'?'Publiserer …'
    :p.step==='uploading'?`Laster opp bilde ${p.index+1} av ${p.count} …`:`Serveren kontrollerer bilde ${p.index+1} av ${p.count} …`;
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
    if (withPoll&&!cleanText(question)) throw new Error('Skriv et spørsmål til avstemningen.');
    if (withPoll&&pollOptions.length<2) throw new Error('En avstemning trenger minst to svaralternativer.');
    // Fristen gjelder til slutten av valgt dag.
    const closesAt = closesOn?new Date(`${closesOn}T23:59:00`).toISOString():undefined;
    try {
      const post = await service.publishPost({ representationId:activeRep.id, draftId:draftId ?? undefined, ...content(),
        poll:withPoll?{ question, options:pollOptions, closesAt }:undefined, images:images.map(i=>({ file:i.file, alt:i.alt })) },
        p=>setProgress(progressText(p)));
      onPublished(post);
      reset();
    } finally { setProgress(''); }
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
    setWithPoll(false); clearImages(); setShowDrafts(false); setPreview(false); setError('');
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
    media:withImage?images.map((i,n)=>({ id:`forhandsvisning-${n}`, type:'image' as const, alt:i.alt, url:i.url })):undefined,
    poll:withPoll&&!editing?{ question:cleanText(question), closesAt:closesOn?formatDayMonth(`${closesOn}T23:59:00`):'ingen frist', options:pollOptions.map((label,i)=>({ id:String(i), label, votes:0 })) }:undefined,
  };
  const title = editing?'Rediger innlegg':draftId?'Rediger utkast':'Nytt innlegg';
  const draftCount = drafts?.length ?? 0;

  return <Modal open={open} onClose={onClose} labelledBy="composer-title">
    <div className="modal-head"><h2 id="composer-title">{title}</h2><button className="close-btn" aria-label="Lukk" onClick={onClose}>×</button></div>
    <div className="modal-body">
      <div className="publisher">
        <Avatar initials={previewPost.initials} size="lg" tone={senderType==='school'?'navy':'coral'} orgType={senderType}/>
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
            <label className={`dash-btn ${withImage?'on':''} ${images.length>=POST_IMAGE_MAX_COUNT || preparing?'disabled':''}`}>
              <span className="square"/>{preparing?'Behandler bildet …':withImage?`Legg til flere bilder (${images.length} av ${POST_IMAGE_MAX_COUNT})`:'Legg til bilde'}
              <input type="file" accept="image/*" multiple className="sr-only" disabled={images.length>=POST_IMAGE_MAX_COUNT || preparing}
                onChange={e=>{ void addImages(e.target.files); e.target.value=''; }}/>
            </label>
          </div>}
          {withImage&&!editing&&<div className="image-inputs">
            {images.map((image,i)=><div className="image-input" key={image.url}>
              <img src={image.url} alt=""/>
              <input value={image.alt} maxLength={ALT_TEXT_MAX_LENGTH} aria-label={`Bildetekst for bilde ${i+1}`} placeholder="Beskriv bildet (for skjermlesere)"
                onChange={e=>setImages(all=>all.map((x,j)=>j===i?{ ...x, alt:e.target.value }:x))}/>
              <button className="btn small" onClick={()=>removeImage(i)} aria-label={`Fjern bilde ${i+1}`}>Fjern</button>
            </div>)}
            <p className="muted small-note">Bildene kodes om i nettleseren, så posisjon (GPS) og annen skjult informasjon fjernes før opplasting. Ikke legg ut bilder av personer uten at de har sagt ja.</p>
          </div>}
          {withPoll&&<div className="poll-inputs">
            <input value={question} maxLength={300} aria-label="Spørsmål" placeholder="Spørsmål" onChange={e=>setQuestion(e.target.value)}/>
            {options.map((value,i)=><input key={i} value={value} maxLength={200} aria-label={`Svaralternativ ${i+1}`} placeholder={`Svaralternativ ${i+1}${i>=2?' (valgfritt)':''}`} onChange={e=>setOptions(all=>all.map((o,j)=>j===i?e.target.value:o))}/>)}
            {options.length<POLL_MAX_OPTIONS&&<button className="link" onClick={()=>setOptions(all=>[...all,''])}>+ Legg til svaralternativ</button>}
            <label className="field"><span>Avsluttes</span><input type="date" value={closesOn} min={isoDate(new Date(Date.now()+24*3600*1000))} max={isoDate(new Date(Date.now()+365*24*3600*1000))} onChange={e=>setClosesOn(e.target.value)}/></label>
            <p className="muted small-note">Hvert elevråd og styre har én stemme, som kan endres til fristen. Resultatet vises når de har stemt, og for alle etter fristen.</p>
          </div>}
          <label className="field"><span>Tagg arrangement</span>
            <select value={eventId} onChange={e=>setEventId(e.target.value)}>
              <option value="">Ingen</option>
              {taggable.map(e=><option key={e.id} value={e.id}>{e.title} · {e.start}</option>)}
            </select>
          </label>
        </>}
      {progress&&<p className="progress-note" role="status">{progress}</p>}
      {error&&<p className="form-error" role="alert">{error}</p>}
    </div>
    <div className="modal-foot">
      <label className="field"><span>Synlig for</span><select value={chosenAudience} onChange={e=>setAudience(e.target.value as Audience)}>{audiences.map(a=><option key={a} value={a}>{audienceLabel[a]}</option>)}</select></label>
      <label className="field"><span>Skoleform</span><select value={schoolLevel} onChange={e=>setSchoolLevel(e.target.value as SchoolLevelTarget)}>{schoolLevels.map(l=><option key={l} value={l}>{schoolLevelLabel[l]}</option>)}</select></label>
      <div className="composer-buttons">
        <button className="btn" onClick={onClose}>Avbryt</button>
        {!editing&&<button className="btn" disabled={!canPublish || busy || withPoll || withImage} title={withPoll||withImage?'Innlegg med avstemning eller bilder publiseres direkte, ikke som utkast':undefined} onClick={()=>void saveDraft()}>Lagre utkast</button>}
        <button className="btn primary lifted" disabled={!canPublish || busy} onClick={()=>void publish()}>{editing?'Lagre endringer':'Publiser'}</button>
      </div>
    </div>
  </Modal>;
}
