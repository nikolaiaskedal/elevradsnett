import { describe, expect, it } from 'vitest';
import { audiencesFor, cleanText, publishPostSchema } from '@/lib/domain/validation';

describe('cleanText (XSS-rensing, samme regel som clean_text i databasen)',()=>{
  it('fjerner tagger, styretegn og usynlige retningstegn',()=>{
    expect(cleanText('  <script>alert(1)</script>Hei <b>du</b>\u0007 ‮!\r\nNy linje  ')).toBe('alert(1)Hei du !\nNy linje');
    expect(cleanText('<img src=x onerror=alert(1)>')).toBe('');
  });
  it('lar vanlige ulikhetstegn stå',()=>{
    expect(cleanText('3 < 5 og 7 > 2')).toBe('3 < 5 og 7 > 2');
  });
  it('brukes av skjemaet for innlegg',()=>{
    expect(publishPostSchema.parse({ representationId:'r', body:'<i>Hei</i>', audience:'public' })).toMatchObject({ body:'Hei', schoolLevel:'both' });
    expect(()=>publishPostSchema.parse({ representationId:'r', body:'<b></b>', audience:'public' })).toThrow('Skriv noe');
  });
});

describe('audiencesFor',()=>{
  it('gir målgruppene som passer avsenderen',()=>{
    expect(audiencesFor('school',true)).toEqual(['public','county','local','friends']);
    expect(audiencesFor('school',false)).toEqual(['public','county','friends']);
    expect(audiencesFor('local_board',false)).toEqual(['public','county','local']);
    expect(audiencesFor('county_board',false)).toEqual(['public','county']);
    expect(audiencesFor('national',false)).toEqual(['public']);
  });
});
