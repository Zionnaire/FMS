export interface PlatformSessionUser {
  sub: string;
  email: string;
  scope: "platform";
  exp: number;
  iat: number;
}

export interface PlatformLoginResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
  };
}

export const TENANT_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSummary extends Tenant {
  caseCount: number;
  userCount: number;
}
