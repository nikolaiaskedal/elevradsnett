import { useCallback, useEffect, useState } from 'react';
import type { AppNotification } from '@/lib/domain/notifications';
import { errorMessage } from '@/lib/domain/validation';
import type { ElevradsnettService } from '@/lib/services/contracts';

/**
 * Varslene til den innloggede, for menyen og Varsler-siden. Hentes på nytt ved innlogging (reloadKey) og når
 * serveren sier at det har kommet noe nytt (sanntid). Utlogget er listen tom.
 */
export function useNotifications(service:ElevradsnettService,signedIn:boolean,reloadKey:number) {
  const [state,setState] = useState<{ key:string; list:AppNotification[]|null; error:string }>({ key:'', list:null, error:'' });
  const key = `${signedIn}:${reloadKey}`;
  const refresh = useCallback(async()=>{
    const list = await service.listNotifications();
    setState({ key, list, error:'' });
    return list;
  },[service,key]);
  useEffect(()=>{
    if (!signedIn) return;
    let cancelled = false;
    let timer = 0;
    const load = ()=>service.listNotifications()
      .then(list=>{ if (!cancelled) setState({ key, list, error:'' }); })
      .catch(e=>{ if (!cancelled) setState(s=>({ key, list:s.key===key?s.list:null, error:errorMessage(e) })); });
    void load();
    const stop = service.subscribeToNotifications(()=>{ window.clearTimeout(timer); timer = window.setTimeout(()=>void load(),300); });
    return ()=>{ cancelled = true; window.clearTimeout(timer); stop(); };
  },[service,signedIn,key]);
  const current = signedIn && state.key===key;
  const notifications = current?state.list:null;
  return { notifications, error:current?state.error:'', refresh, unread:(notifications ?? []).filter(n=>!n.read).length };
}
