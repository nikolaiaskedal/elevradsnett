import type { OrganizationStatus, OrganizationType } from './types';

export type AdminStats = {
  activeUsers:number;
  activeSchools:number;
  newUsers30Days:number;
  publishedPosts:number;
  comments:number;
  reactions:number;
  eventRegistrations:number;
  completedHandovers:number;
  openModerationCases:number;
};

export type AdminUser = {
  id:string;
  name:string;
  schoolId:string|null;
  schoolName:string;
  status:OrganizationStatus;
  deactivatedByUser:boolean;
};

export type AdminSchool = {
  id:string;
  name:string;
  county:string;
  localBoardName:string;
  status:OrganizationStatus;
  administratorCount:number;
  deactivationReason?:string;
};

export type AdminContent = {
  id:string;
  type:'post'|'comment'|'event';
  title:string;
  organizationName:string;
  status:string;
  createdAt:string;
};

export type AdminMedia = {
  id:string;
  type:'profile'|'cover'|'post'|'event';
  ownerName:string;
  path:string;
  processingStatus:'pending'|'ready'|'failed';
  isPlaceholder:boolean;
};

export type AdminPlaceholder = {
  id:string;
  type:'organization'|'post_media'|'event';
  title:string;
  organizationName:string;
};

/** Eksempelinnholdet superadministrator kan skru av og på: brukere ved skoler, innlegg, arrangementer og samtaler. */
export type PlaceholderContentStatus = {
  enabled:boolean;
  profiles:number;
  posts:number;
  events:number;
  conversations:number;
};

export type ResolvedAdminImage = { path?:string; sourceName:string; sourceLevel:'own'|'local'|'county'|'global'|'none' };
export type AdminImages = {
  organizationId:string;
  locked:boolean;
  ownProfilePath?:string;
  ownCoverPath?:string;
  defaultProfilePath?:string;
  defaultCoverPath?:string;
  profile:ResolvedAdminImage;
  cover:ResolvedAdminImage;
};

export type AdminDashboard = {
  stats:AdminStats;
  users:AdminUser[];
  schools:AdminSchool[];
  content:AdminContent[];
  media:AdminMedia[];
  placeholders:AdminPlaceholder[];
  images:AdminImages;
};

export type ModerationTargetType = 'post'|'comment'|'profile'|'media'|'message';
export type ModerationAction = 'hide'|'delete'|'warn'|'restrict'|'deactivate'|'restore'|'no_action';
export type ModerationReport = {
  id:string;
  targetType:ModerationTargetType;
  targetId:string;
  targetSummary:string;
  category:string;
  description?:string;
  sharedMessageExcerpt?:string;
  status:'open'|'reviewing'|'resolved'|'appealed'|'closed';
  reporterName:string;
  assignedToName?:string;
  createdAt:string;
  actions:{ id:string; action:ModerationAction; reason:string; moderatorName:string; createdAt:string }[];
};

export type MfaStatus = { required:boolean; enrolled:boolean; verified:boolean; factorId?:string };
export type TotpEnrollment = { factorId:string; qrCode:string; secret:string };

export type OrganizationAdminTarget = { id:string; type:OrganizationType; status:OrganizationStatus };
