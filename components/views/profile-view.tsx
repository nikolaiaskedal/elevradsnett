import { useApp } from '@/components/app-context';
import { Avatar, Status } from '@/components/shared/ui';
import type { Representation } from '@/lib/domain/types';

const systemRoles = ['Elevrådsleder','Elevrådsmedlem','Fylkesstyremedlem','Sentralstyremedlem','Administrator'];

export function ProfileView({onSwitch}:{onSwitch:(rep:Representation)=>void}) {
  const { currentUser, representations, org, go, activeRep } = useApp();
  const school = org(currentUser.schoolId);
  const held = new Set(representations.map(r=>r.publicRole));
  return <div className="page" style={{ gap:16 }}>
    <div className="profile-card">
      <Avatar initials={currentUser.initials} size="xl"/>
      <div className="names">
        <h1>{currentUser.name}</h1>
        <p className="role">{activeRep.publicRole}</p>
        <p className="school">{school?.schoolName ?? school?.name} · {school?.county}</p>
      </div>
      <button className="btn ghost large" onClick={()=>go({ view:'organization', id:currentUser.schoolId })}>Åpne elevrådets side</button>
    </div>
    <section className="section-card">
      <h2>Representerer</h2>
      <div className="list" style={{ gap:10 }}>
        {representations.map(rep=>{ const o=org(rep.organizationId); const on=rep.id===activeRep.id; return <div className={`rep-row ${on?'on':''}`} key={rep.id}>
          <button className="rep-main" onClick={()=>go({ view:'organization', id:rep.organizationId })}>
            <Avatar initials={rep.initials} size="lg" tone={on?'coral':'navy'}/>
            <span className="grow"><span className="rep-name">{rep.name}</span><span className="sub">{rep.publicRole} · {o?.contactEmail ?? o?.county}{rep.canPublish?'':' · kan ikke publisere'}</span></span>
          </button>
          {on?<Status tone="coral">Aktiv</Status>:<button className="btn small" onClick={()=>onSwitch(rep)}>Bruk</button>}
        </div>; })}
      </div>
      <p className="chip-label">Roller i systemet</p>
      <div className="chips">
        {systemRoles.map(role=><span key={role} className={`chip ${held.has(role)?'on':''}`}>{role}</span>)}
        {representations.filter(r=>r.type!=='school').map(r=><span key={r.id} className="chip navy">{r.publicRole} i {r.name}</span>)}
      </div>
      <p className="muted" style={{ marginTop:10, lineHeight:1.5 }}>Én representasjon er aktiv om gangen og bestemmer hvem du publiserer og kommenterer som. Meldinger er alltid personlige.</p>
    </section>
  </div>;
}
