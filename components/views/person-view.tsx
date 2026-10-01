import { useEffect, useState } from 'react';
import { useApp } from '@/components/app-context';
import { useService } from '@/components/service-provider';
import { PersonCvSections, Stars } from '@/components/shared/cv';
import { NotFound } from '@/components/shared/not-found';
import { Avatar } from '@/components/shared/ui';
import type { PersonCv } from '@/lib/domain/types';
import { errorMessage } from '@/lib/domain/validation';

/** Offentlig CV for en person (§8). Kan leses uten innlogging; deaktiverte personer har ingen offentlig side. */
export function PersonView({id}:{id:string}) {
  const service = useService();
  const { currentUser, go } = useApp();
  const [state,setState] = useState<{ id:string; cv:PersonCv|null; error:string }|null>(null);
  useEffect(()=>{
    let cancelled = false;
    service.getPersonCv(id).then(cv=>{ if (!cancelled) setState({ id, cv, error:'' }); }).catch(e=>{ if (!cancelled) setState({ id, cv:null, error:errorMessage(e) }); });
    return ()=>{ cancelled = true; };
  },[service,id]);
  if (state?.id!==id) return <div className="page"><p className="muted">Henter …</p></div>;
  if (state.error) return <div className="page narrow"><p className="form-error" role="alert">{state.error}</p></div>;
  const cv = state.cv;
  if (!cv) return <NotFound/>;
  return <div className="page" style={{ gap:16 }}>
    <div className="profile-card">
      <Avatar initials={cv.initials} size="xl" src={cv.avatarUrl}/>
      <div className="names">
        <h1>{cv.name} <Stars count={cv.stars}/></h1>
        {cv.schoolName&&<p className="school">{cv.schoolName}</p>}
        {!cv.active&&<p className="warn-box">Profilen er deaktivert. Bare du ser denne siden.</p>}
      </div>
      {currentUser?.id===cv.id&&<div className="actions"><button className="btn large" onClick={()=>go({ view:'profile' })}>Til profilen din</button></div>}
    </div>
    <PersonCvSections cv={cv}/>
  </div>;
}
