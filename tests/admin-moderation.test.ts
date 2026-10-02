import { DEMO_LOGIN_CODE, DemoElevradsnettService } from '@/lib/services/demo-service';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Adminpanel og moderering',()=>{
  let service:DemoElevradsnettService;
  beforeEach(()=>{ service=new DemoElevradsnettService(); });

  it('avgrenser statistikk, brukere og skoler til området',async()=>{
    const dashboard=await service.getAdminDashboard('oslo-fylke');
    expect(dashboard.stats.activeSchools).toBeGreaterThan(0);
    expect(dashboard.users.length).toBeGreaterThan(0);
    expect(dashboard.schools.every(s=>s.county==='Oslo')).toBe(true);
    expect(dashboard.stats).not.toHaveProperty('messageContents');
  });

  it('bytter skole og deaktiverer en bruker med revisjonsspor',async()=>{
    const dashboard=await service.getAdminDashboard('oslo-fylke');
    const person=dashboard.users.find(user=>user.id!=='user-ida')!;
    await service.manageAdminUser({ scopeId:'oslo-fylke',userId:person.id,action:'change_school',schoolId:'kuben',reason:'Bekreftet skolebytte' });
    expect((await service.getAdminDashboard('oslo-fylke')).users.find(user=>user.id===person.id)?.schoolId).toBe('kuben');
    await service.manageAdminUser({ scopeId:'oslo-fylke',userId:person.id,action:'deactivate',reason:'Vervet er avsluttet' });
    expect((await service.getAdminDashboard('oslo-fylke')).users.find(user=>user.id===person.id)?.status).toBe('deactivated');
    expect((await service.listAuditLog('oslo-fylke')).map(entry=>entry.action)).toEqual(expect.arrayContaining(['user.change_school','user.deactivate']));
  });

  it('lar bare superadministrator skru eksempelinnholdet av og på',async()=>{
    await expect(service.getPlaceholderContentStatus()).rejects.toThrow('tilgang');
    await expect(service.setPlaceholderContent(true)).rejects.toThrow('tilgang');
  });

  it('deaktiverer og reaktiverer en skole uten å fjerne historikken',async()=>{
    await service.setOrganizationStatus({ scopeId:'oslo-fylke',organizationId:'kuben',status:'deactivated',reason:'Midlertidig uten elevråd' });
    expect((await service.getOrganization('kuben'))?.status).toBe('deactivated');
    await service.setOrganizationStatus({ scopeId:'oslo-fylke',organizationId:'kuben',status:'active',reason:'Nytt elevråd er valgt' });
    expect((await service.getOrganization('kuben'))?.status).toBe('active');
  });

  it('behandler en modereringssak og støtter klage',async()=>{
    const [report]=await service.listModerationReports('oslo-fylke');
    await service.applyModerationAction({ reportId:report.id,action:'warn',reason:'Innholdet bryter retningslinjene' });
    expect((await service.listModerationReports('oslo-fylke'))[0]).toMatchObject({ status:'resolved',assignedToName:'Ida Halvorsen' });
    await service.appealModerationReport({ reportId:report.id,reason:'Jeg ber om en ny vurdering' });
    expect((await service.listModerationReports('oslo-fylke'))[0].status).toBe('appealed');
  });

  it('validerer TOTP-kode i den delte MFA-flyten',async()=>{
    const enrollment=await service.enrollTotp();
    await expect(service.verifyTotp({ factorId:enrollment.factorId,code:'111111' })).rejects.toThrow('ikke godkjent');
    await service.verifyTotp({ factorId:enrollment.factorId,code:DEMO_LOGIN_CODE });
    expect(await service.getMfaStatus()).toMatchObject({ enrolled:true,verified:true });
  });
});
