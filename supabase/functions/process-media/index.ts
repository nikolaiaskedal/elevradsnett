import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const signatures:Record<string,number[][]>={
  'image/jpeg':[[0xff,0xd8,0xff]],
  'image/png':[[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]],
  'image/webp':[[0x52,0x49,0x46,0x46]],
  'application/pdf':[[0x25,0x50,0x44,0x46]],
};
const matches=(bytes:Uint8Array,mime:string)=>signatures[mime]?.some(sig=>sig.every((value,index)=>bytes[index]===value))??mime.startsWith('video/');

Deno.serve(async(req)=>{
  const auth=req.headers.get('authorization'); if(!auth)return new Response('Unauthorized',{status:401});
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}});
  const {bucket,path,mime,byteSize}=await req.json();
  const limits:Record<string,number>={'public-avatars':5_242_880,'public-covers':10_485_760,'public-content':104_857_600,'private-message-attachments':26_214_400};
  if(!limits[bucket]||byteSize>limits[bucket])return Response.json({error:'invalid_size'},{status:422});
  const {data,error}=await client.storage.from(bucket).download(path); if(error)return Response.json({error:error.message},{status:400});
  const bytes=new Uint8Array(await data.slice(0,16).arrayBuffer()); if(!matches(bytes,mime))return Response.json({error:'mime_mismatch'},{status:422});
  // Production deployment wires an approved transformer to strip EXIF/GPS, optimize
  // images, and create video thumbnails before marking database metadata ready.
  return Response.json({status:'validated',path,requiresTransform:mime.startsWith('image/')||mime.startsWith('video/')});
});
