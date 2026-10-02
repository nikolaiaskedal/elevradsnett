// Kontroll og opprydding av bildefiler (§11). Kjører med service role på serveren; nøkkelen finnes bare her.
//
// POST { action:'check', bucket, path }
//   Laster ned filen, avgjør filtypen ut fra innholdet og sjekker størrelse, mål og at EXIF, XMP og GPS er borte
//   (supabase/functions/_shared/media-check.ts). Resultatet lagres i media_checks (record_media_check). Avviste filer slettes.
//   Bare den som lastet opp filen kan be om kontroll.
// POST { action:'cleanup' }
//   Sletter filene databasen har lagt i storage_deletions (slettede innlegg, byttede bilder, avviste filer).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { BUCKET_LIMITS, checkImage } from '../_shared/media-check.ts';

const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS' };
const reply = (body:unknown,status = 200)=>Response.json(body,{ status, headers:cors });

Deno.serve(async(req)=>{
  if (req.method==='OPTIONS') return new Response('ok',{ headers:cors });
  if (req.method!=='POST') return reply({ error:'method_not_allowed' },405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{ auth:{ persistSession:false } });
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i,'');
  const { data:userData } = token ? await admin.auth.getUser(token) : { data:{ user:null } };
  const user = userData.user;
  if (!user) return reply({ error:'unauthorized' },401);

  let input:{ action?:string; bucket?:string; path?:string };
  try { input = await req.json(); } catch { return reply({ error:'invalid_request' },400); }

  if (input.action==='cleanup') {
    const { data:pending,error } = await admin.rpc('pending_storage_deletions',{ p_limit:200 });
    if (error) return reply({ error:'cleanup_failed' },500);
    const rows = (pending ?? []) as { id:number; bucket:string; path:string }[];
    const done:number[] = [];
    for (const bucket of new Set(rows.map(r=>r.bucket))) {
      const items = rows.filter(r=>r.bucket===bucket);
      const removed = await admin.storage.from(bucket).remove(items.map(r=>r.path));
      if (!removed.error) done.push(...items.map(r=>r.id));
    }
    if (done.length) await admin.rpc('mark_storage_deleted',{ p_ids:done });
    return reply({ deleted:done.length });
  }

  const { bucket,path } = input;
  if (input.action!=='check' || !bucket || !path || !BUCKET_LIMITS[bucket] || path.includes('..')) return reply({ error:'invalid_request' },400);
  const { data:info,error:infoError } = await admin.rpc('media_object_info',{ p_bucket:bucket, p_path:path });
  const object = (info as { owner_id:string|null; mime_type:string|null; byte_size:number|null; already_checked:boolean }[]|null)?.[0];
  if (infoError || !object) return reply({ error:'not_found' },404);
  if (object.owner_id!==user.id) return reply({ error:'forbidden' },403);

  const download = await admin.storage.from(bucket).download(path);
  if (download.error) return reply({ error:'not_found' },404);
  const bytes = new Uint8Array(await download.data.arrayBuffer());
  const result = checkImage(bytes,object.mime_type,BUCKET_LIMITS[bucket]);
  const { error:saveError } = await admin.rpc('record_media_check',{
    p_bucket:bucket, p_path:path, p_status:result.ok?'ready':'failed', p_mime:result.ok?result.mime:result.mime ?? null, p_size:bytes.length,
    p_width:result.ok?result.width:null, p_height:result.ok?result.height:null, p_reason:result.ok?null:result.reason, p_user:user.id,
  });
  if (saveError) return reply({ error:'save_failed' },500);
  if (!result.ok) {
    await admin.storage.from(bucket).remove([path]);
    return reply({ status:'failed', reason:result.reason },422);
  }
  return reply({ status:'ready', width:result.width, height:result.height });
});
