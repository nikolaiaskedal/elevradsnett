import { describe,expect,it } from 'vitest';
import { feedScore,mayPublish } from '@/lib/domain/authorization';

describe('organization authorization',()=>{
  it('requires both active membership and a live grant',()=>{
    const grants=[{role:'content_manager' as const,organizationId:'school-a',active:true}];
    expect(mayPublish({organizationId:'school-a',organizationType:'school',hasActiveMembership:true,grants})).toBe(true);
    expect(mayPublish({organizationId:'school-b',organizationType:'school',hasActiveMembership:true,grants})).toBe(false);
    expect(mayPublish({organizationId:'school-a',organizationType:'school',hasActiveMembership:false,grants})).toBe(false);
  });
  it('never combines organization authority',()=>{
    const grants=[{role:'school_admin' as const,organizationId:'school-a',active:true},{role:'board_admin' as const,organizationId:'board-b',active:true}];
    expect(mayPublish({organizationId:'school-a',organizationType:'school',hasActiveMembership:true,grants})).toBe(true);
    expect(mayPublish({organizationId:'unknown',organizationType:'school',hasActiveMembership:true,grants})).toBe(false);
  });
});

describe('feed ranking',()=>{
  it('prioritizes official and geographically relevant content',()=>{
    const ordinary=feedScore({priority:false,sameCounty:false,sameLocalBoard:false,followed:false,sameSchoolLevel:true,ageHours:1,engagement:1000});
    const official=feedScore({priority:true,sameCounty:true,sameLocalBoard:false,followed:true,sameSchoolLevel:true,ageHours:30,engagement:0});
    expect(official).toBeGreaterThan(ordinary);
  });
});
