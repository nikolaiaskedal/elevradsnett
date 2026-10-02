// Kontroll av bildefiler på serveren (§11). Ren TypeScript uten Deno- eller Node-API-er, så den kan testes med vitest
// (tests/media-check.test.ts) og brukes av edge-funksjonen process-media.
//
// Bildene kodes om i nettleseren før opplasting, så EXIF og GPS forsvinner. Her sjekkes det at det faktisk er gjort:
// filtypen avgjøres av innholdet (ikke filnavnet), og filen kan ikke ha EXIF-, XMP-, IPTC- eller tekstmetadata.

export type ImageMime = 'image/jpeg'|'image/png'|'image/webp';
export type MediaCheckResult =
  | { ok:true; mime:ImageMime; width:number; height:number }
  | { ok:false; reason:'unknown_type'|'type_mismatch'|'too_large'|'has_metadata'|'bad_dimensions'|'corrupt'; mime?:ImageMime };

export const MAX_IMAGE_SIDE = 4096;

const startsWith = (bytes:Uint8Array,signature:number[],offset = 0)=>signature.every((value,index)=>bytes[offset+index]===value);
const ascii = (bytes:Uint8Array,offset:number,length:number)=>String.fromCharCode(...bytes.subarray(offset,offset+length));

/** Faktisk filtype ut fra de første bytene. */
export function sniffImageType(bytes:Uint8Array):ImageMime|null {
  if (startsWith(bytes,[0xff,0xd8,0xff])) return 'image/jpeg';
  if (startsWith(bytes,[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) return 'image/png';
  if (bytes.length>=12 && ascii(bytes,0,4)==='RIFF' && ascii(bytes,8,4)==='WEBP') return 'image/webp';
  return null;
}

type Inspection = { width:number; height:number; metadata:boolean }|null;

function inspectJpeg(b:Uint8Array):Inspection {
  let i = 2, width = 0, height = 0, metadata = false;
  while (i+4<=b.length) {
    if (b[i]!==0xff) return null;
    const marker = b[i+1];
    if (marker===0xd8 || (marker>=0xd0 && marker<=0xd7) || marker===0x01) { i += 2; continue; }
    if (marker===0xd9) break;
    const length = (b[i+2]<<8) | b[i+3];
    if (length<2 || i+2+length>b.length) return null;
    // APP1 (EXIF og XMP), APP13 (IPTC/Photoshop) og COM (kommentar) kan inneholde personopplysninger og posisjon.
    if (marker===0xe1 || marker===0xed || marker===0xfe) metadata = true;
    // SOF0–SOF15 unntatt DHT (C4), JPG (C8) og DAC (CC) har høyde og bredde.
    if (marker>=0xc0 && marker<=0xcf && marker!==0xc4 && marker!==0xc8 && marker!==0xcc && length>=7) {
      height = (b[i+5]<<8) | b[i+6];
      width = (b[i+7]<<8) | b[i+8];
    }
    if (marker===0xda) break; // Bildedata følger; metadata står alltid før.
    i += 2+length;
  }
  return width && height ? { width, height, metadata } : null;
}

const u32be = (b:Uint8Array,o:number)=>((b[o]<<24)>>>0)+((b[o+1]<<16) | (b[o+2]<<8) | b[o+3]);
const u32le = (b:Uint8Array,o:number)=>(b[o] | (b[o+1]<<8) | (b[o+2]<<16))+((b[o+3]<<24)>>>0);

function inspectPng(b:Uint8Array):Inspection {
  if (b.length<33 || ascii(b,12,4)!=='IHDR') return null;
  const width = u32be(b,16), height = u32be(b,20);
  let i = 8, metadata = false;
  while (i+8<=b.length) {
    const length = u32be(b,i), type = ascii(b,i+4,4);
    if (['eXIf','tEXt','iTXt','zTXt'].includes(type)) metadata = true;
    if (type==='IEND') break;
    i += 12+length;
  }
  return { width, height, metadata };
}

function inspectWebp(b:Uint8Array):Inspection {
  let i = 12, width = 0, height = 0, metadata = false;
  while (i+8<=b.length) {
    const type = ascii(b,i,4), length = u32le(b,i+4), data = i+8;
    if (type==='EXIF' || type==='XMP ') metadata = true;
    if (type==='VP8X' && data+10<=b.length) {
      width = 1+(b[data+4] | (b[data+5]<<8) | (b[data+6]<<16));
      height = 1+(b[data+7] | (b[data+8]<<8) | (b[data+9]<<16));
    } else if (type==='VP8 ' && !width && data+10<=b.length) {
      width = (b[data+6] | (b[data+7]<<8)) & 0x3fff;
      height = (b[data+8] | (b[data+9]<<8)) & 0x3fff;
    } else if (type==='VP8L' && !width && data+5<=b.length) {
      const bits = b[data+1] | (b[data+2]<<8) | (b[data+3]<<16) | (b[data+4]<<24);
      width = (bits & 0x3fff)+1;
      height = ((bits>>>14) & 0x3fff)+1;
    }
    i = data+length+(length%2);
  }
  return width && height ? { width, height, metadata } : null;
}

/**
 * Kontrollerer en bildefil. declaredMime er typen filen ble lastet opp med; den må stemme med innholdet.
 * maxBytes er grensen for lagringsområdet.
 */
export function checkImage(bytes:Uint8Array,declaredMime:string|null|undefined,maxBytes:number):MediaCheckResult {
  if (bytes.length>maxBytes) return { ok:false, reason:'too_large' };
  const mime = sniffImageType(bytes);
  if (!mime) return { ok:false, reason:'unknown_type' };
  if (declaredMime && declaredMime!==mime) return { ok:false, reason:'type_mismatch', mime };
  const info = mime==='image/jpeg'?inspectJpeg(bytes):mime==='image/png'?inspectPng(bytes):inspectWebp(bytes);
  if (!info) return { ok:false, reason:'corrupt', mime };
  if (info.metadata) return { ok:false, reason:'has_metadata', mime };
  if (info.width<1 || info.height<1 || info.width>MAX_IMAGE_SIDE || info.height>MAX_IMAGE_SIDE) return { ok:false, reason:'bad_dimensions', mime };
  return { ok:true, mime, width:info.width, height:info.height };
}

/** Grensene for de offentlige lagringsområdene (samme som i migrasjonen 202610110001_bilder.sql). */
export const BUCKET_LIMITS:Record<string,number> = {
  'public-avatars':5*1024*1024,
  'public-covers':10*1024*1024,
  'public-content':10*1024*1024,
};
