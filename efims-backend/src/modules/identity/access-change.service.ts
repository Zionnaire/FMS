import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessChangeRequest, AccessChangeStatus, AccessChangeType, AuditOutcome, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { DecideAccessChangeDto } from './dto/decide-access-change.dto';
import { RequestAccessChangeDto } from './dto/request-access-change.dto';
import { UsersService } from './users.service';

/**
 * Owns `AccessChangeRequest` — maker-checker for role/compartment changes on a tenant `User`,
 * added 2026-10-14 alongside the 20-role expansion (see that migration's `AccessChangeRequest`
 * doc comment in schema.prisma for why this is its own model rather than reusing
 * `ApprovalRequest`). Mirrors `ApprovalService`'s shape deliberately: same segregation-of-duties
 * rule (the requester cannot decide their own request), same "every request and decision is
 * audited" posture, same PENDING/APPROVED/REJECTED lifecycle. Deciding is `ADMIN`-only — gated at
 * the controller, not here, same division of labor every other module uses.
 */
@Injectable()
export class AccessChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly usersService: UsersService,
  ) {}

  async request(actor: AuthenticatedUser, targetUserId: string, dto: RequestAccessChangeDto): Promise<AccessChangeRequest> {
    await this.usersService.assertUserExists(targetUserId);

    const payload = this.buildPayload(dto);

    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.accessChangeRequest.create({
        data: {
          tenantId: actor.tenantId,
          targetUserId,
          changeType: dto.changeType,
          payload,
          requestNotes: dto.requestNotes,
          requestedBy: actor.sub,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'identity.access_change.request',
      entityType: 'AccessChangeRequest',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { targetUserId, changeType: dto.changeType },
    });

    return created;
  }

  async list(targetUserId?: string): Promise<AccessChangeRequest[]> {
    return this.prisma.forCurrentTenant((tx) =>
      tx.accessChangeRequest.findMany({ where: targetUserId ? { targetUserId } : undefined, orderBy: { requestedAt: 'desc' } }),
    );
  }

  /** Applies the change the moment it's approved — there's no separate "apply" step, matching
   * `ApprovalService.decide`'s own pattern of the decision itself being the trigger (e.g.
   * `ContainmentService`/`RecoveryService` still gate their own write on `assertApproved`, but
   * nothing here needs an equivalent second gate: a role/compartment change has no further
   * action to protect). */
  async decide(actor: AuthenticatedUser, requestId: string, dto: DecideAccessChangeDto): Promise<AccessChangeRequest> {
    const request = await this.prisma.forCurrentTenant((tx) => tx.accessChangeRequest.findUnique({ where: { id: requestId } }));
    if (!request) {
      throw new NotFoundException('Access change request not found');
    }
    if (request.status !== AccessChangeStatus.PENDING) {
      throw new BadRequestException(`Request is already ${request.status.toLowerCase()}`);
    }
    if (request.requestedBy === actor.sub) {
      await this.auditService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.sub,
        action: 'identity.access_change.decide',
        entityType: 'AccessChangeRequest',
        entityId: requestId,
        outcome: AuditOutcome.DENIED,
        metadata: { reason: 'self_decision_blocked' },
      });
      throw new ForbiddenException('The requester cannot decide their own access change request');
    }

    const status = dto.approved ? AccessChangeStatus.APPROVED : AccessChangeStatus.REJECTED;
    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.accessChangeRequest.update({
        where: { id: requestId },
        data: { status, decidedBy: actor.sub, decidedAt: new Date(), decisionNotes: dto.decisionNotes },
      }),
    );

    if (status === AccessChangeStatus.APPROVED) {
      await this.apply(actor, request);
    }

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'identity.access_change.decide',
      entityType: 'AccessChangeRequest',
      entityId: requestId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { status, changeType: request.changeType },
    });

    return updated;
  }

  private async apply(actor: AuthenticatedUser, request: AccessChangeRequest): Promise<void> {
    const payload = request.payload as { role?: string; compartment?: string; expiresAt?: string };
    switch (request.changeType) {
      case AccessChangeType.ROLE_CHANGE:
        await this.usersService.changeRole(request.targetUserId, payload.role as Parameters<UsersService['changeRole']>[1]);
        return;
      case AccessChangeType.GRANT_COMPARTMENT:
        await this.usersService.grantCompartment(
          actor.tenantId,
          request.targetUserId,
          payload.compartment as Parameters<UsersService['grantCompartment']>[2],
          actor.sub,
          payload.expiresAt ? new Date(payload.expiresAt) : undefined,
        );
        return;
      case AccessChangeType.REVOKE_COMPARTMENT:
        await this.usersService.revokeCompartment(request.targetUserId, payload.compartment as Parameters<UsersService['revokeCompartment']>[1]);
        return;
    }
  }

  private buildPayload(dto: RequestAccessChangeDto): Prisma.InputJsonValue {
    switch (dto.changeType) {
      case AccessChangeType.ROLE_CHANGE:
        if (!dto.role) throw new BadRequestException('role is required for a ROLE_CHANGE request');
        return { role: dto.role };
      case AccessChangeType.GRANT_COMPARTMENT:
        if (!dto.compartment) throw new BadRequestException('compartment is required for a GRANT_COMPARTMENT request');
        return { compartment: dto.compartment, expiresAt: dto.expiresAt };
      case AccessChangeType.REVOKE_COMPARTMENT:
        if (!dto.compartment) throw new BadRequestException('compartment is required for a REVOKE_COMPARTMENT request');
        return { compartment: dto.compartment };
    }
  }
}
