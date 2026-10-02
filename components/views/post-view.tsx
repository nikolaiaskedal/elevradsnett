import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/app-context';
import { useService } from '@/components/service-provider';
import { NotFound } from '@/components/shared/not-found';
import { PostCard } from '@/components/shared/post-card';

/** Ett innlegg (`#/innlegg/<id>`), for delte lenker. Serveren avgjør om innlegget er synlig; ellers vises «fant ikke». */
export function PostView({id}:{id:string}) {
  const service = useService();
  const { posts, rememberPost, go } = useApp();
  const [state,setState] = useState<{ id:string; found:boolean }|null>(null);
  // rememberPost er ny ved hver oppdatering av appen, så den leses fra en ref: det holder å hente når innlegget byttes.
  const remember = useRef(rememberPost);
  useEffect(()=>{ remember.current = rememberPost; });
  useEffect(()=>{
    let cancelled = false;
    service.getPost(id).then(post=>{
      if (cancelled) return;
      if (post) remember.current(post);
      setState({ id, found:!!post });
    }).catch(()=>{ if (!cancelled) setState({ id, found:false }); });
    return ()=>{ cancelled = true; };
  },[id,service]);
  const post = posts.find(p=>p.id===id);
  if (state?.id===id && !state.found) return <NotFound/>;
  if (!post) return <div className="page"><p className="muted">Henter …</p></div>;
  return <div className="page">
    <button className="link back-link" onClick={()=>go({ view:'feed' })}>← Til forsiden</button>
    <PostCard post={post}/>
  </div>;
}
