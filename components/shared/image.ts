// Omkoding av bilder i nettleseren før opplasting. Når bildet tegnes på nytt, forsvinner EXIF- og GPS-data.

const AVATAR_SIZE = 512;
const MAX_INPUT_BYTES = 25*1024*1024;

/** Beskjærer til kvadrat, skalerer til 512 px og lagrer som WebP (eller JPEG der WebP mangler). */
export async function prepareAvatar(file:File):Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Velg en bildefil.');
  if (file.size>MAX_INPUT_BYTES) throw new Error('Bildet er for stort. Velg et bilde under 25 MB.');
  let bitmap:ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('Bildet kunne ikke leses. Prøv et annet bilde.'); }
  const side = Math.min(bitmap.width,bitmap.height);
  const size = Math.min(AVATAR_SIZE,side);
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Nettleseren kan ikke behandle bildet.');
  context.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,size,size);
  bitmap.close();
  const encode = (type:string)=>new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,type,0.86));
  const blob = (await encode('image/webp').then(b=>b?.type==='image/webp'?b:null)) ?? await encode('image/jpeg');
  if (!blob) throw new Error('Bildet kunne ikke behandles. Prøv et annet bilde.');
  return blob;
}
