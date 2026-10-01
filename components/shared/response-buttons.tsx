import { useApp } from '@/components/app-context';
import type { Event } from '@/lib/domain/types';

export function ResponseButtons({event:e,large}:{event:Event;large?:boolean}) {
  const { responses, respond } = useApp();
  const response=responses[e.id];
  return <>
    <button className={`btn ${large?'large':''} ${response==='going'?'on':''}`} aria-pressed={response==='going'} onClick={()=>respond(e.id,'going')}>Skal</button>
    <button className={`btn ${large?'large':''} ${response==='interested'?'soft-on':''}`} aria-pressed={response==='interested'} onClick={()=>respond(e.id,'interested')}>Interessert</button>
  </>;
}
