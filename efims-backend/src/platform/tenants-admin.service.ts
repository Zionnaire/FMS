import { Injectable, NotFoundException } from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { provisionTenant } from './tenant-provisioning';

export interface TenantSummary extends Tenant {
  caseCount: number;
  userCount: number;
}

/**
 * The platform layer's one real cross-tenant capability: list/create/suspend tenants themselves.
 * `list()` follows the exact pattern `SlaClockService.sweepBreachedClocks()` already established
 * for legitimate cross-tenant backend code — list tenants directly off the plain client (no
 * `app.current_tenant` to set, `tenants` isn't RLS-scoped), then `withTenant(tenant.id, ...)`
 * explicitly, once per tenant, for anything that *is* tenant-scoped (here, a cheap case/user
 * count for the platform dashboard). `create()` is a thin wrapper around `provisionTenant` — see
 * that function's own doc comment for why the actual bootstrap logic lives there, shared with
 * `prisma/seed.ts`.
 */
@Injectable()
export class TenantsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<TenantSummary[]> {
    const tenants = await this.prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } });

    const summaries: TenantSummary[] = [];
    for (const tenant of tenants) {
      // Sequential, not Promise.all — same "don't fire concurrent transactions against the
      // remote database" reasoning `ConfigurationService.getAllCurrent`/`ApprovalService.request`
      // already document; a handful of tenants at a time is cheap enough either way.
      const [caseCount, userCount] = await this.prisma.withTenant(tenant.id, (tx) =>
        Promise.all([tx.case.count(), tx.user.count()]),
      );
      summaries.push({ ...tenant, caseCount, userCount });
    }
    return summaries;
  }

  async create(dto: CreateTenantDto): Promise<Tenant> {
    const { tenantId } = await provisionTenant(this.prisma, {
      slug: dto.slug,
      name: dto.name,
      adminEmail: dto.adminEmail,
      adminFullName: dto.adminFullName,
      adminPassword: dto.adminPassword,
    });
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    return tenant;
  }

  async updateStatus(id: string, dto: UpdateTenantStatusDto): Promise<Tenant> {
    const existing = await this.prisma.tenant.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Tenant not found');
    }
    return this.prisma.tenant.update({ where: { id }, data: { status: dto.status } });
  }
}
