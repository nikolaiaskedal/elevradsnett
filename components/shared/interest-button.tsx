import { useApp } from '@/components/app-context';
import { isOpenEvent } from '@/lib/domain/events';
import type { Event } from '@/lib/domain/types';

/** Personlig interesse (§8). Er adskilt fra påmelding av organisasjonen, som gjøres på arrangementsiden. */
export function InterestButton({event:e,large}:{event:Event;large?:boolean}) {
  const { toggleInterest } = useApp();
  if (!isOpenEvent(e) && !e.interestedByMe) return null;
  return <button className={`btn ${large?'large':''} ${e.interestedByMe?'soft-on':''}`} aria-pressed={!!e.interestedByMe} onClick={()=>toggleInterest(e)}>
    {e.interestedByMe?'Interessert ✓':'Interessert'}
  </button>;
}
