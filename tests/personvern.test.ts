import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it } from 'vitest';
import { consentChoice, LEGAL_VERSIONS, needsConsent, type OptionalPurpose } from '@/lib/domain/legal';
import { mustAcceptTerms } from '@/lib/domain/privacy';
import { consentSchema, decideDataRequestSchema } from '@/lib/domain/validation';
import { DEMO_EMAIL, DEMO_LOGIN_CODE, DemoElevradsnettService } from '@/lib/services/demo-service';
import { SupabaseElevradsnettService } from '@/lib/services/supabase-service';

const purposes:OptionalPurpose[] = [{ id:'analytics', label:'Bruksstatistikk', description:'', provider:'PostHog', enabled:true }];

describe('Versjonene av vilkårene',()=>{
  it('er de samme i appen og i migrasjonen',()=>{
    const sql = readFileSync('supabase/migrations/202610150001_personvern.sql','utf8');
    for (const [kind,version] of Object.entries(LEGAL_VERSIONS)) expect(sql).toContain(`('${kind}','${version}'`);
  });
});

describe('Samtykke',()=>{
  it('viser ikke banneret når ingen valgfrie tjenester er slått på',()=>{
    expect(needsConsent(null)).toBe(false);
    expect(needsConsent(null,purposes.map(p=>({ ...p, enabled:false })))).toBe(false);
  });
  it('viser banneret til brukeren har valgt for gjeldende versjon',()=>{
    expect(needsConsent(null,purposes)).toBe(true);
    expect(needsConsent({ version:'1999-01-01', purposes:{ analytics:true } },purposes)).toBe(true);
    expect(needsConsent({ version:LEGAL_VERSIONS.cookies, purposes:{ analytics:false } },purposes)).toBe(false);
  });
  it('avslår alt som ikke er valgt',()=>{
    expect(consentChoice([],purposes)).toEqual({ analytics:false });
    expect(consentChoice(['analytics'],purposes)).toEqual({ analytics:true });
  });
  it('godtar bare kjente formål og en gyldig nettleser-id',()=>{
    expect(consentSchema.safeParse({ version:'v', purposes:{ analytics:true } }).success).toBe(true);
    expect(consentSchema.safeParse({ version:'v', purposes:{ 'Ugyldig formål':true } }).success).toBe(false);
    expect(consentSchema.safeParse({ version:'v', purposes:{}, anonymousId:'kort' }).success).toBe(false);
  });
  it('krever begrunnelse ved avslag på sletting',()=>{
    expect(decideDataRequestSchema.safeParse({ requestId:'r', status:'rejected' }).success).toBe(false);
    expect(decideDataRequestSchema.safeParse({ requestId:'r', status:'rejected', notes:'Ikke fra personen selv' }).success).toBe(true);
  });
});

describe('Demo: personvern',()=>{
  let service:DemoElevradsnettService;
  beforeEach(()=>{ service = new DemoElevradsnettService(); });
  async function newUser(email = 'ny.elev@example.invalid') {
    await service.signOut();
    await service.requestLoginCode({ email });
    await service.verifyLoginCode({ email, code:DEMO_LOGIN_CODE });
    await service.completeOnboarding({ schoolId:'elvebakken', displayName:'Ny Elev' });
  }

  it('Ida har godtatt gjeldende vilkår, nye brukere må godta dem',async()=>{
    expect(mustAcceptTerms(await service.getPrivacyStatus())).toBe(false);
    await newUser();
    const privacy = await service.getPrivacyStatus();
    expect(mustAcceptTerms(privacy)).toBe(true);
    await expect(service.acceptTerms({ termsVersion:'1999-01-01', privacyVersion:LEGAL_VERSIONS.privacy })).rejects.toThrow(/oppdatert/);
    await service.acceptTerms({ termsVersion:LEGAL_VERSIONS.terms, privacyVersion:LEGAL_VERSIONS.privacy });
    expect(mustAcceptTerms(await service.getPrivacyStatus())).toBe(false);
  });
  it('lagrer siste samtykke, også uten innlogging',async()=>{
    await service.recordConsent({ version:LEGAL_VERSIONS.cookies, purposes:{ analytics:true } });
    await service.recordConsent({ version:LEGAL_VERSIONS.cookies, purposes:{ analytics:false } });
    expect((await service.getPrivacyStatus()).consent?.purposes).toEqual({ analytics:false });
    await service.signOut();
    await expect(service.recordConsent({ version:LEGAL_VERSIONS.cookies, purposes:{ analytics:true } })).rejects.toThrow();
    await service.recordConsent({ version:LEGAL_VERSIONS.cookies, purposes:{ analytics:true }, anonymousId:'nettleser-1234567890' });
  });
  it('stopper siste administrator fra å deaktivere seg selv',async()=>{
    await expect(service.deactivateAccount()).rejects.toThrow(/eneste administratoren/);
    expect((await service.getSession()).status).toBe('active');
  });
  it('deaktiverer og aktiverer egen profil; vervene avsluttes',async()=>{
    await newUser();
    await service.deactivateAccount();
    expect((await service.getSession()).status).toBe('deactivated');
    await expect(service.setFollow({ organizationId:'elvebakken', following:true })).rejects.toThrow();
    const privacy = await service.getPrivacyStatus();
    expect(privacy).toMatchObject({ status:'deactivated', deactivatedByUser:true });
    // Deaktivert kan fortsatt laste ned data og be om sletting.
    expect((await service.exportMyData()).profile).toMatchObject({ name:'Ny Elev', email:'ny.elev@example.invalid' });
    await service.requestDeletion();
    await service.reactivateAccount();
    expect((await service.getSession()).status).toBe('active');
  });
  it('sletting: brukeren ber om det, kan trekke det, og bare superadministrator kan behandle',async()=>{
    await service.requestDeletion();
    await expect(service.requestDeletion()).rejects.toThrow(/allerede/);
    const [request] = (await service.getPrivacyStatus()).requests;
    expect(request).toMatchObject({ kind:'deletion', status:'pending' });
    await expect(service.listDataRequests()).rejects.toThrow(/tilgang/);
    await service.cancelDataRequest(request.id);
    expect((await service.getPrivacyStatus()).requests[0].status).toBe('cancelled');
  });
  it('eksporten har profil, verv og godkjente vilkår',async()=>{
    await service.signOut();
    await service.requestLoginCode({ email:DEMO_EMAIL });
    await service.verifyLoginCode({ email:DEMO_EMAIL, code:DEMO_LOGIN_CODE });
    const data = await service.exportMyData();
    expect(data.profile).toMatchObject({ email:DEMO_EMAIL });
    expect((data.publicOffices as unknown[]).length).toBeGreaterThan(0);
    expect(data.termsAccepted).toEqual([expect.objectContaining({ termsVersion:LEGAL_VERSIONS.terms })]);
  });
});

describe('Supabase: personvern',()=>{
  function fake(rpcs:Record<string,unknown>) {
    const calls:{ name:string; args?:unknown }[] = [];
    const client = {
      auth:{ getSession:async()=>({ data:{ session:{ user:{ id:'u1' } } } }) },
      rpc:async(name:string,args?:unknown)=>{ calls.push({ name,args }); const v = rpcs[name]; return v instanceof Error?{ data:null, error:{ message:v.message } }:{ data:v ?? null, error:null }; },
    };
    return { service:new SupabaseElevradsnettService(client as unknown as SupabaseClient), calls };
  }
  it('sender versjonene og samtykket i formatet RPC-ene forventer',async()=>{
    const { service,calls } = fake({});
    await service.acceptTerms({ termsVersion:LEGAL_VERSIONS.terms, privacyVersion:LEGAL_VERSIONS.privacy });
    await service.recordConsent({ version:LEGAL_VERSIONS.cookies, purposes:{ analytics:false } });
    await service.requestDeletion();
    await service.decideDataRequest({ requestId:'r1', status:'completed' });
    expect(calls).toEqual([
      { name:'accept_terms', args:{ p_terms_version:LEGAL_VERSIONS.terms, p_privacy_version:LEGAL_VERSIONS.privacy } },
      { name:'record_consent', args:{ p_anonymous_id:null, p_version:LEGAL_VERSIONS.cookies, p_purposes:{ analytics:false } } },
      { name:'request_personal_data', args:{ p_kind:'deletion' } },
      { name:'decide_data_subject_request', args:{ p_request:'r1', p_status:'completed', p_notes:null } },
    ]);
  });
  it('oversetter feilene til norsk',async()=>{
    const { service } = fake({ deactivate_my_account:new Error('you are last administrator'), reactivate_my_account:new Error('deactivated by administrator') });
    await expect(service.deactivateAccount()).rejects.toThrow(/eneste administratoren/);
    await expect(service.reactivateAccount()).rejects.toThrow(/deaktivert av en administrator/);
  });
});
