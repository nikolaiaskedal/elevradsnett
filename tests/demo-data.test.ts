import { describe,expect,it } from 'vitest';
import { conversations,currentUser,demoFormerOfficers,demoGrants,demoRepresentationIds,demoSchoolAdminRequests,events,initialPosts,organizations } from '@/lib/demo-data';

const ids=new Set(organizations.map(o=>o.id));

describe('demo data',()=>{
  it('only references organizations that exist',()=>{
    for (const post of initialPosts) {
      expect(ids.has(post.organizationId)).toBe(true);
      for (const comment of post.commentItems ?? []) expect(ids.has(comment.organizationId)).toBe(true);
    }
    for (const event of events) expect(ids.has(event.hostId)).toBe(true);
    for (const id of Object.keys(demoRepresentationIds)) expect(ids.has(id)).toBe(true);
    for (const office of demoFormerOfficers) expect(ids.has(office.organizationId)).toBe(true);
    for (const grant of demoGrants) expect(ids.has(grant.organizationId)).toBe(true);
    for (const request of demoSchoolAdminRequests) expect(ids.has(request.schoolId)).toBe(true);
    for (const conversation of conversations) if (conversation.organizationId) expect(ids.has(conversation.organizationId)).toBe(true);
    expect(ids.has(currentUser.schoolId ?? '')).toBe(true);
  });
  it('keeps comment counts in sync with loaded comments',()=>{
    for (const post of initialPosts) expect(post.comments).toBe(post.commentItems?.length ?? post.comments);
  });
  it('uses ISO start dates so day and month render without timezone drift',()=>{
    for (const event of events) expect(event.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it('links posts only to known events',()=>{
    const eventIds=new Set(events.map(e=>e.id));
    for (const post of initialPosts) if (post.eventId) expect(eventIds.has(post.eventId)).toBe(true);
  });
});
