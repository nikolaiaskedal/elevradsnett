import { useApp } from '@/components/app-context';
import { eventDay, eventMonth } from '@/components/format';
import type { Event } from '@/lib/domain/types';

export function EventMini({event:e,flat}:{event:Event;flat?:boolean}) {
  const { go } = useApp();
  return <button className={`event-mini ${flat?'flat':''}`} onClick={()=>go({ view:'event', id:e.id })}>
    <span className="date-box">{eventDay(e)}<small>{eventMonth(e)}</small></span>
    <span className="grow"><span className="title">{e.title}</span><span className="sub">{flat?`${e.start} · ${e.place}`:`${e.host} · ${e.place}`}</span></span>
  </button>;
}
