import { useApp } from '@/components/app-context';
import { orgSub } from '@/components/format';
import { Avatar } from '@/components/shared/ui';
import type { Organization } from '@/lib/domain/types';

export function OrgRow({org:o,openOnly}:{org:Organization;openOnly?:boolean}) {
  const { go, toggleFollow } = useApp();
  const open=()=>go({ view:'organization', id:o.id });
  return <div className="org-row">
    <Avatar initials={o.initials} tone={openOnly?'coral':'navy'}/>
    <div className="grow"><button className="name-link" onClick={open}>{o.name}</button><p className="sub">{orgSub(o)}</p></div>
    {openOnly
      ?<button className="btn ghost small follow" onClick={open}>Åpne</button>
      :<FollowButton org={o} onClick={()=>toggleFollow(o.id)}/>}
  </div>;
}

export function FollowButton({org:o,onClick,className='small follow'}:{org:Organization;onClick:()=>void;className?:string}) {
  return <button className={`btn ${className} ${o.following?'soft-on':'on'}`} aria-pressed={!!o.following} onClick={onClick}>{o.following?'Følger':'Følg'}</button>;
}
