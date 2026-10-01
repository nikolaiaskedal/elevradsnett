// Vedlegg i meldinger. Bilder kodes om i nettleseren før opplasting, så EXIF- og GPS-data forsvinner (§11).
import { MESSAGE_ATTACHMENT_MAX_BYTES } from '@/lib/domain/validation';

const MAX_SIDE = 2048;

/** Bilder skaleres til maks 2048 px og lagres som WebP (eller JPEG). PDF sendes som den er. */
export async function prepareMessageAttachment(file:File):Promise<File> {
  if (file.type==='application/pdf') {
    if (file.size>MESSAGE_ATTACHMENT_MAX_BYTES) throw new Error('Vedlegg kan være maks 25 MB.');
    return file;
  }
  if (!file.type.startsWith('image/')) throw new Error('Vedlegg må være et bilde eller en PDF.');
  if (file.size>MESSAGE_ATTACHMENT_MAX_BYTES) throw new Error('Bildet er for stort. Velg et bilde under 25 MB.');
  let bitmap:ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('Bildet kunne ikke leses. Prøv et annet bilde.'); }
  const scale = Math.min(1,MAX_SIDE/Math.max(bitmap.width,bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width*scale); canvas.height = Math.round(bitmap.height*scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Nettleseren kan ikke behandle bildet.');
  context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  bitmap.close();
  const encode = (type:string)=>new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,type,0.86));
  const blob = (await encode('image/webp').then(b=>b?.type==='image/webp'?b:null)) ?? await encode('image/jpeg');
  if (!blob) throw new Error('Bildet kunne ikke behandles. Prøv et annet bilde.');
  const base = file.name.replace(/\.[^.]+$/,'') || 'bilde';
  return new File([blob],`${base}.${blob.type==='image/webp'?'webp':'jpg'}`,{ type:blob.type });
}

export function formatFileSize(bytes:number) {
  if (bytes<1024*1024) return `${Math.max(1,Math.round(bytes/1024))} kB`;
  return `${(bytes/1024/1024).toFixed(1).replace('.',',')} MB`;
}
