import { describe, expect, it } from 'vitest';
import { checkImage, sniffImageType } from '@/supabase/functions/_shared/media-check';

// Små, håndlagde filer som bare har det kontrollen leser: signatur, metadata-segmenter og mål.
const LIMIT = 10*1024*1024;
const be16 = (n:number)=>[(n>>8)&0xff,n&0xff];
const be32 = (n:number)=>[(n>>>24)&0xff,(n>>16)&0xff,(n>>8)&0xff,n&0xff];
const le32 = (n:number)=>[n&0xff,(n>>8)&0xff,(n>>16)&0xff,(n>>>24)&0xff];
const text = (s:string)=>Array.from(new TextEncoder().encode(s));

function jpeg({ width = 800, height = 600, exif = false } = {}) {
  const app0 = [0xff,0xe0,...be16(16),...text('JFIF'),0,1,1,0,0,1,0,1,0,0];
  const app1 = exif?[0xff,0xe1,...be16(12),...text('Exif'),0,0,0x4d,0x4d,0,0x2a]:[];
  const sof = [0xff,0xc0,...be16(11),8,...be16(height),...be16(width),1,1,0x11,0];
  const sos = [0xff,0xda,...be16(8),1,1,0,0,0x3f,0];
  return new Uint8Array([0xff,0xd8,...app0,...app1,...sof,...sos,0x12,0x34,0xff,0xd9]);
}
function png({ width = 400, height = 300, chunk }:{ width?:number; height?:number; chunk?:string } = {}) {
  const ihdr = [...be32(13),...text('IHDR'),...be32(width),...be32(height),8,6,0,0,0,0,0,0,0];
  const extra = chunk?[...be32(4),...text(chunk),1,2,3,4,0,0,0,0]:[];
  const iend = [...be32(0),...text('IEND'),0,0,0,0];
  return new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,...ihdr,...extra,...iend]);
}
function webp({ width = 1024, height = 768, exif = false } = {}) {
  const w = width-1, h = height-1;
  const vp8x = [...text('VP8X'),...le32(10),exif?0x08:0,0,0,0,w&0xff,(w>>8)&0xff,(w>>16)&0xff,h&0xff,(h>>8)&0xff,(h>>16)&0xff];
  const exifChunk = exif?[...text('EXIF'),...le32(4),1,2,3,4]:[];
  const body = [...text('WEBP'),...vp8x,...exifChunk];
  return new Uint8Array([...text('RIFF'),...le32(body.length),...body]);
}

describe('kontroll av bilder i process-media',()=>{
  it('avgjør filtypen ut fra innholdet',()=>{
    expect(sniffImageType(jpeg())).toBe('image/jpeg');
    expect(sniffImageType(png())).toBe('image/png');
    expect(sniffImageType(webp())).toBe('image/webp');
    expect(sniffImageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
  });
  it('godtar omkodede bilder uten metadata og leser målene',()=>{
    expect(checkImage(jpeg(),'image/jpeg',LIMIT)).toEqual({ ok:true, mime:'image/jpeg', width:800, height:600 });
    expect(checkImage(png(),'image/png',LIMIT)).toEqual({ ok:true, mime:'image/png', width:400, height:300 });
    expect(checkImage(webp(),'image/webp',LIMIT)).toEqual({ ok:true, mime:'image/webp', width:1024, height:768 });
  });
  it('avviser EXIF, GPS og tekstmetadata',()=>{
    expect(checkImage(jpeg({ exif:true }),'image/jpeg',LIMIT)).toMatchObject({ ok:false, reason:'has_metadata' });
    expect(checkImage(webp({ exif:true }),'image/webp',LIMIT)).toMatchObject({ ok:false, reason:'has_metadata' });
    expect(checkImage(png({ chunk:'eXIf' }),'image/png',LIMIT)).toMatchObject({ ok:false, reason:'has_metadata' });
    expect(checkImage(png({ chunk:'tEXt' }),'image/png',LIMIT)).toMatchObject({ ok:false, reason:'has_metadata' });
  });
  it('avviser feil filtype, for store filer og for store mål',()=>{
    expect(checkImage(png(),'image/jpeg',LIMIT)).toMatchObject({ ok:false, reason:'type_mismatch' });
    expect(checkImage(new TextEncoder().encode('hei'),'image/webp',LIMIT)).toMatchObject({ ok:false, reason:'unknown_type' });
    expect(checkImage(jpeg(),'image/jpeg',10)).toMatchObject({ ok:false, reason:'too_large' });
    expect(checkImage(jpeg({ width:5000 }),'image/jpeg',LIMIT)).toMatchObject({ ok:false, reason:'bad_dimensions' });
    expect(checkImage(new Uint8Array([0xff,0xd8,0xff,0x00]),'image/jpeg',LIMIT)).toMatchObject({ ok:false, reason:'corrupt' });
  });
});
