// Omkoding av bilder i nettleseren før opplasting. Når bildet tegnes på nytt, forsvinner EXIF- og GPS-data.

const AVATAR_SIZE = 512;
const MAX_INPUT_BYTES = 25*1024*1024;

/** Beskjærer til kvadrat, skalerer til 512 px og lagrer som WebP (eller JPEG der WebP mangler). */
export async function prepareAvatar(file:File):Promise<Blob> {
  const bitmap = await readImage(file);
  const side = Math.min(bitmap.width,bitmap.height);
  const size = Math.min(AVATAR_SIZE,side);
  return draw(bitmap,size,size,context=>context.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,size,size));
}

const EVENT_IMAGE_WIDTH = 1600;
/** Arrangementsbilde: beholder formatet, skalerer ned til maks 1600 px bredt og lagrer som WebP (eller JPEG). */
export async function prepareEventImage(file:File):Promise<Blob> {
  const bitmap = await readImage(file);
  const scale = Math.min(1,EVENT_IMAGE_WIDTH/bitmap.width);
  const width = Math.round(bitmap.width*scale), height = Math.round(bitmap.height*scale);
  return draw(bitmap,width,height,context=>context.drawImage(bitmap,0,0,width,height));
}

async function readImage(file:File) {
  if (!file.type.startsWith('image/')) throw new Error('Velg en bildefil.');
  if (file.size>MAX_INPUT_BYTES) throw new Error('Bildet er for stort. Velg et bilde under 25 MB.');
  try { return await createImageBitmap(file); } catch { throw new Error('Bildet kunne ikke leses. Prøv et annet bilde.'); }
}

async function draw(bitmap:ImageBitmap,width:number,height:number,paint:(context:CanvasRenderingContext2D)=>void):Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Nettleseren kan ikke behandle bildet.');
  paint(context);
  bitmap.close();
  const encode = (type:string)=>new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,type,0.86));
  const blob = (await encode('image/webp').then(b=>b?.type==='image/webp'?b:null)) ?? await encode('image/jpeg');
  if (!blob) throw new Error('Bildet kunne ikke behandles. Prøv et annet bilde.');
  return blob;
}
