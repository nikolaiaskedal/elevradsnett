import { useEffect, useState } from 'react';
import { useApp } from '@/components/app-context';
import { parseHash } from '@/components/routing';
import { useService } from '@/components/service-provider';
import { Status } from '@/components/shared/ui';
import { NOTIFICATION_CATEGORIES, inviteSummary, notificationCategoryLabel, type AppNotification, type MyHandoverInvite, type NotificationCategory, type NotificationPreferences } from '@/lib/domain/notifications';
import { formatDate, formatRelative } from '@/lib/domain/time';
import { errorMessage } from '@/lib/domain/validation';

// Varsler (§5, prompt 11): invitasjoner til nytt styre, varslene i plattformen og innstillingene for varsler.
// Serveren lagrer varslene og avgjør hva som sendes; e-post kommer som ett daglig sammendrag.

export function NotificationsView({notifications,error,refresh}:{notifications:AppNotification[]|null;error:string;refresh:()=>Promise<unknown>}){
  const service = useService();
  const { go, notify, reload } = useApp();
  const [busy,setBusy] = useState(false);
  const [failure,setFailure] = useState('');
  const unread = (notifications ?? []).filter(n=>!n.read);
  const open = (n:AppNotification)=>{
    const done = ()=>{ if (n.link) go(parseHash(n.link)); };
    if (n.read) { done(); return; }
    service.markNotificationsRead([n.id]).then(()=>refresh()).catch(()=>{}).finally(done);
  };
  const markAll = async()=>{
    setBusy(true); setFailure('');
    try { await service.markNotificationsRead(); await refresh(); notify('Alle varsler er merket som lest'); }
    catch (e) { setFailure(errorMessage(e)); }
    finally { setBusy(false); }
  };
  return <div className="page narrow">
    <div className="page-head split">
      <div className="grow"><h1>Varsler</h1><p className="muted">{unread.length?`${unread.length} uleste`:'Du har lest alt.'}</p></div>
      {!!unread.length&&<button className="btn" disabled={busy} onClick={()=>void markAll()}>Merk alle som lest</button>}
    </div>
    <Invitations onChanged={()=>{ void refresh(); reload(); }}/>
    <section className="card" aria-labelledby="notifications-title">
      <div className="card-head"><div><h2 id="notifications-title">Siste varsler</h2></div></div>
      {(error || failure)&&<p className="form-error" role="alert">{error || failure}</p>}
      {!notifications&&!error&&<p className="muted">Henter varslene …</p>}
      {notifications&&!notifications.length&&<p className="empty-note">Ingen varsler ennå. Her kommer beskjeder om meldinger, verv, arrangementer og styreoverføring.</p>}
      {!!notifications?.length&&<ul className="notification-list">{notifications.map(n=><li key={n.id}>
        <button className={`notification ${n.read?'':'unread'}`} onClick={()=>open(n)} aria-label={`${n.read?'':'Ulest: '}${n.title}${n.count>1?`, ${n.count} nye`:''}`}>
          <span className="notification-dot" aria-hidden="true"/>
          <span className="grow">
            <strong>{n.title}{n.count>1&&n.category==='messages'?` (${n.count})`:''}</strong>
            {n.body&&<span className="notification-body">{n.body}</span>}
            <small>{notificationCategoryLabel[n.category].label} · {formatRelative(n.createdAt)}</small>
          </span>
        </button>
      </li>)}</ul>}
    </section>
    <Preferences onNotify={notify}/>
  </div>;
}

/** Invitasjoner til nytt styre. Den inviterte godtar selv; rollen gjelder fra aktiveringsdatoen (§5). */
function Invitations({onChanged}:{onChanged:()=>void}){
  const service = useService();
  const { notify, go } = useApp();
  const [invites,setInvites] = useState<MyHandoverInvite[]|null>(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [version,setVersion] = useState(0);
  useEffect(()=>{
    let cancelled = false;
    service.listMyHandoverInvites().then(list=>{ if (!cancelled) setInvites(list); }).catch(e=>{ if (!cancelled) setError(errorMessage(e)); });
    return ()=>{ cancelled = true; };
  },[service,version]);
  if (!invites?.length && !error) return null;
  const respond = async(invite:MyHandoverInvite,accept:boolean)=>{
    setBusy(true); setError('');
    try {
      await service.respondToHandoverInvite({ inviteId:invite.id, accept });
      notify(accept?`Du har godtatt invitasjonen fra ${invite.organizationName}`:'Du har takket nei');
      setVersion(v=>v+1); onChanged();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  return <section className="card warm-card" aria-labelledby="invites-title">
    <div className="card-head"><div><h2 id="invites-title">Invitasjoner til nytt styre</h2><p className="muted">Rollen gjelder fra aktiveringsdatoen, og først når du har godtatt.</p></div></div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="list">{(invites ?? []).map(i=><div className="request-row" key={i.id}>
      <div className="row-card wrap">
        <span className="grow"><strong>{i.organizationName}: {inviteSummary(i)}</strong><small>Fra {formatDate(i.activationDate)} · invitert av {i.invitedByName || 'skoleadministrator'}</small></span>
        <Status tone="coral">Venter på deg</Status>
      </div>
      {!i.atSchool&&<p className="warn-box">Du må gå på {i.organizationName} for å godta. Bytt skole under <button className="link" onClick={()=>go({ view:'profile' })}>Profil</button> først.</p>}
      <div className="actions">
        <button className="btn primary" disabled={busy || !i.atSchool} onClick={()=>void respond(i,true)}>Godta</button>
        <button className="btn" disabled={busy} onClick={()=>void respond(i,false)}>Takk nei</button>
      </div>
    </div>)}</div>
  </section>;
}

/** Egne innstillinger: kanalene, og hvilke typer varsler som skal komme i hver kanal. */
function Preferences({onNotify}:{onNotify:(text:string)=>void}){
  const service = useService();
  const [prefs,setPrefs] = useState<NotificationPreferences|null>(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  useEffect(()=>{
    let cancelled = false;
    service.getNotificationPreferences().then(p=>{ if (!cancelled) setPrefs(p); }).catch(e=>{ if (!cancelled) setError(errorMessage(e)); });
    return ()=>{ cancelled = true; };
  },[service]);
  const toggle = (key:'inAppOff'|'emailOff',category:NotificationCategory)=>setPrefs(p=>p&&({ ...p, [key]:p[key].includes(category)?p[key].filter(c=>c!==category):[...p[key],category] }));
  const save = async()=>{
    if (!prefs) return;
    setBusy(true); setError('');
    try { await service.setNotificationPreferences(prefs); onNotify('Innstillingene er lagret'); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  return <section className="card" aria-labelledby="prefs-title">
    <div className="card-head"><div><h2 id="prefs-title">Innstillinger</h2><p className="muted">E-post kommer som ett sammendrag om dagen, bare når du har uleste varsler. Innholdet i meldinger sendes aldri på e-post.</p></div></div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {!prefs&&!error&&<p className="muted">Henter innstillingene …</p>}
    {prefs&&<>
      <div className="check-row"><input type="checkbox" id="pref-in-app" checked={prefs.inApp} onChange={e=>setPrefs({ ...prefs, inApp:e.target.checked })}/>
        <label htmlFor="pref-in-app"><strong>I Elevrådsnett</strong><span className="muted">Varsler her og antallet i menyen.</span></label></div>
      <div className="check-row"><input type="checkbox" id="pref-email" checked={prefs.email} onChange={e=>setPrefs({ ...prefs, email:e.target.checked })}/>
        <label htmlFor="pref-email"><strong>Daglig sammendrag på e-post</strong><span className="muted">Sendes til e-postadressen du logger inn med.</span></label></div>
      <div className="check-row"><input type="checkbox" id="pref-push" checked={false} disabled/>
        <label htmlFor="pref-push"><strong>Pushvarsler<span className="later-tag">Kommer senere</span></strong><span className="muted">Kommer med mobilappen.</span></label></div>
      <fieldset className="pref-table">
        <legend>Hva du vil bli varslet om</legend>
        <div className="pref-row head" aria-hidden="true"><span className="grow">Type</span><span>Her</span><span>E-post</span></div>
        {NOTIFICATION_CATEGORIES.map(c=><div className="pref-row" key={c}>
          <span className="grow"><strong>{notificationCategoryLabel[c].label}</strong><small>{notificationCategoryLabel[c].description}</small></span>
          <input type="checkbox" aria-label={`${notificationCategoryLabel[c].label} i Elevrådsnett`} disabled={!prefs.inApp} checked={prefs.inApp && !prefs.inAppOff.includes(c)} onChange={()=>toggle('inAppOff',c)}/>
          <input type="checkbox" aria-label={`${notificationCategoryLabel[c].label} på e-post`} disabled={!prefs.email} checked={prefs.email && !prefs.emailOff.includes(c)} onChange={()=>toggle('emailOff',c)}/>
        </div>)}
      </fieldset>
      <div className="actions"><button className="btn primary" disabled={busy} onClick={()=>void save()}>Lagre innstillingene</button></div>
    </>}
  </section>;
}
