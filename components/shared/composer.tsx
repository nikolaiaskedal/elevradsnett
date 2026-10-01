import { useState } from 'react';
import { useApp } from '@/components/app-context';
import { audienceLabel } from '@/components/format';
import { Avatar, Modal } from '@/components/shared/ui';
import { useService } from '@/components/service-provider';
import type { Audience, Post } from '@/lib/domain/types';
import { errorMessage, POST_MAX_LENGTH } from '@/lib/domain/validation';

/** Vises bare når brukeren har en aktiv representasjon (se elevradsnett-app). */
export function Composer({open,onClose,onPublish}:{open:boolean;onClose:()=>void;onPublish:(post:Post)=>void}) {
  const service = useService();
  const { currentUser, activeRep:rep, notify } = useApp();
  const activeRep = rep!;
  const [text,setText] = useState('');
  const [withPoll,setWithPoll] = useState(false);
  const [withImage,setWithImage] = useState(false);
  const [options,setOptions] = useState(['','','']);
  const [audience,setAudience] = useState<Audience>('public');
  const reset=()=>{ setText(''); setWithPoll(false); setWithImage(false); setOptions(['','','']); setAudience('public'); };
  const publish=async()=>{
    const body=text.trim();
    if (!activeRep.canPublish) return;
    if (!body) { notify('Skriv noe før du publiserer'); return; }
    const pollOptions=options.map(o=>o.trim()).filter(Boolean);
    if (withPoll&&pollOptions.length<2) { notify('En avstemning trenger minst to svaralternativer'); return; }
    try {
      const post = await service.publishPost({ representationId:activeRep.id, body, audience, status:'published', poll:withPoll?{ options:pollOptions }:undefined, withImage });
      onPublish(post);
      reset();
    } catch (error) { notify(errorMessage(error)); }
  };
  const publisherKind = activeRep.type==='school'?'elevrådet':activeRep.type==='county_board'?'fylkeslaget':activeRep.type==='local_board'?'lokallaget':'EO';
  return <Modal open={open} onClose={onClose} labelledBy="composer-title">
    <div className="modal-head"><h2 id="composer-title">Nytt innlegg</h2><button className="close-btn" aria-label="Lukk" onClick={onClose}>×</button></div>
    <div className="modal-body">
      <div className="publisher"><Avatar initials={activeRep.initials} size="lg" tone={activeRep.type==='school'?'navy':'coral'} orgType={activeRep.type}/><div><strong>{activeRep.name}</strong><p className="sub">Publiseres av {publisherKind} · {currentUser?.name}</p></div></div>
      {!activeRep.canPublish&&<p className="warn-box">{activeRep.name} har ikke gitt deg publiseringsrett. Bytt representasjon under Profil for å publisere.</p>}
      <textarea value={text} onChange={e=>setText(e.target.value)} aria-label="Tekst" placeholder={`Hva har ${publisherKind} jobbet med?`} maxLength={POST_MAX_LENGTH}/>
      <div className="dash-grid">
        <button className={`dash-btn ${withPoll?'on':''}`} aria-pressed={withPoll} onClick={()=>setWithPoll(v=>!v)}><span className="dot"/>{withPoll?'Poll lagt til · trykk for å fjerne':'Legg til poll'}</button>
        <button className={`dash-btn ${withImage?'on':''}`} aria-pressed={withImage} onClick={()=>setWithImage(v=>!v)}><span className="square"/>{withImage?'Bilde lagt til · trykk for å fjerne':'Legg til bilde'}</button>
      </div>
      {withPoll&&<div className="poll-inputs">{options.map((value,i)=><input key={i} value={value} aria-label={`Svaralternativ ${i+1}`} placeholder={`Svaralternativ ${i+1}${i===2?' (valgfritt)':''}`} onChange={e=>setOptions(all=>all.map((o,j)=>j===i?e.target.value:o))}/>)}</div>}
    </div>
    <div className="modal-foot">
      <label className="field"><span>Synlig for</span><select value={audience} onChange={e=>setAudience(e.target.value as Audience)}>{(['public','county','friends'] as Audience[]).map(a=><option key={a} value={a}>{audienceLabel[a]}</option>)}</select></label>
      <button className="btn" onClick={onClose}>Avbryt</button>
      <button className="btn primary lifted" disabled={!activeRep.canPublish} onClick={()=>void publish()}>Publiser</button>
    </div>
  </Modal>;
}
