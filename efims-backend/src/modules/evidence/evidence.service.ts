import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditOutcome, CustodyAction, EvidenceItem } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { CasesService } from '../cases/cases.service';
import { IngestEvidenceDto } from './dto/ingest-evidence.dto';
import { RecordCustodyEventDto } from './dto/record-custody-event.dto';
import { SetLegalHoldDto } from './dto/set-legal-hold.dto';
import { VerifyEvidenceDto } from './dto/verify-evidence.dto';

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Owns `EvidenceItem`/`CustodyEvent` — architecture.md's "vault, hashing, custody, legal hold".
 * Every method calls `casesService.getById(actor, caseId)` first, the same "check access via the
 * owning module's service, not a copy of its logic" discipline `investigations` already
 * established. This module is deliberately NOT a file/object store — see `EvidenceItem`'s doc
 * comment in schema.prisma for the scope boundary (hash + custody ledger only, content lives
 * externally).
 */
@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly casesService: CasesService,
  ) {}

  async ingest(actor: AuthenticatedUser, caseId: string, dto: IngestEvidenceDto): Promise<EvidenceItem> {
    await this.casesService.getById(actor, caseId);

    const contentHash = hashContent(dto.content);

    const created = await this.prisma.forCurrentTenant(async (tx) => {
      const item = await tx.evidenceItem.create({
        data: {
          tenantId: actor.tenantId,
          caseId,
          category: dto.category,
          title: dto.title,
          description: dto.description,
          externalRef: dto.externalRef,
          sourceSystem: dto.sourceSystem,
          contentHash,
          collectedBy: actor.sub,
        },
      });
      await tx.custodyEvent.create({
        data: {
          tenantId: actor.tenantId,
          evidenceItemId: item.id,
          action: CustodyAction.COLLECTED,
          actorUserId: actor.sub,
        },
      });
      return item;
    });

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'evidence.item.ingest',
      entityType: 'EvidenceItem',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, category: created.category, contentHash },
    });

    return created;
  }

  async listItems(actor: AuthenticatedUser, caseId: string): Promise<EvidenceItem[]> {
    await this.casesService.getById(actor, caseId);
    return this.prisma.forCurrentTenant((tx) =>
      tx.evidenceItem.findMany({ where: { caseId }, orderBy: { collectedAt: 'desc' } }),
    );
  }

  async getById(actor: AuthenticatedUser, caseId: string, evidenceId: string) {
    await this.casesService.getById(actor, caseId);
    const item = await this.prisma.forCurrentTenant((tx) =>
      tx.evidenceItem.findUnique({
        where: { id: evidenceId },
        include: { custodyEvents: { orderBy: { occurredAt: 'asc' } } },
      }),
    );
    if (!item || item.caseId !== caseId) {
      throw new NotFoundException('Evidence item not found on this case');
    }
    return item;
  }

  async recordCustodyEvent(
    actor: AuthenticatedUser,
    caseId: string,
    evidenceId: string,
    dto: RecordCustodyEventDto,
  ) {
    const item = await this.assertItemOnCase(actor, caseId, evidenceId);

    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.custodyEvent.create({
        data: {
          tenantId: actor.tenantId,
          evidenceItemId: item.id,
          action: dto.action,
          actorUserId: actor.sub,
          relatedUserId: dto.relatedUserId,
          notes: dto.notes,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'evidence.custody.record',
      entityType: 'CustodyEvent',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, evidenceItemId: item.id, custodyAction: dto.action },
    });

    return created;
  }

  /** Recomputes the hash from re-supplied content and compares it to what was recorded at
   * ingest — detects tampering after the fact (architecture.md §7), it cannot prevent tampering
   * on whatever external system actually holds the content. Always logs a `HASH_VERIFIED`
   * custody event, whether the check passed or failed — a verification attempt is itself part
   * of the chain of custody, not just its outcome. */
  async verify(actor: AuthenticatedUser, caseId: string, evidenceId: string, dto: VerifyEvidenceDto) {
    const item = await this.assertItemOnCase(actor, caseId, evidenceId);

    const recomputedHash = hashContent(dto.content);
    const intact = recomputedHash === item.contentHash;

    await this.prisma.forCurrentTenant((tx) =>
      tx.custodyEvent.create({
        data: {
          tenantId: actor.tenantId,
          evidenceItemId: item.id,
          action: CustodyAction.HASH_VERIFIED,
          actorUserId: actor.sub,
          notes: intact ? 'Hash verified: content matches ingest-time hash.' : 'Hash mismatch: supplied content does NOT match the recorded hash.',
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'evidence.hash.verify',
      entityType: 'EvidenceItem',
      entityId: item.id,
      outcome: intact ? AuditOutcome.SUCCESS : AuditOutcome.FAILURE,
      metadata: { caseId, intact },
    });

    return { intact, storedHash: item.contentHash, recomputedHash };
  }

  async setLegalHold(actor: AuthenticatedUser, caseId: string, evidenceId: string, dto: SetLegalHoldDto) {
    const item = await this.assertItemOnCase(actor, caseId, evidenceId);

    if (item.legalHold === dto.hold) {
      throw new BadRequestException(`This evidence item is already ${dto.hold ? 'under' : 'not under'} legal hold`);
    }

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.evidenceItem.update({
        where: { id: evidenceId },
        data: dto.hold
          ? { legalHold: true, legalHoldReason: dto.reason, legalHoldSetBy: actor.sub, legalHoldSetAt: new Date() }
          : { legalHold: false, legalHoldReason: null, legalHoldSetBy: null, legalHoldSetAt: null },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: dto.hold ? 'evidence.legal_hold.set' : 'evidence.legal_hold.release',
      entityType: 'EvidenceItem',
      entityId: evidenceId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, reason: dto.reason },
    });

    return updated;
  }

  /** Cross-case "needs attention" queue for the Evidence Custodian dashboard (added 2026-10-14) —
   * every case-scoped route above requires a `caseId` up front; this is the one place this module
   * answers "across every case this actor can access, what evidence still needs me." Needs-
   * attention = never hash-verified since ingest, OR currently under legal hold (both are states
   * a custodian should be actively tracking, not routine already-settled evidence). */
  async queue(actor: AuthenticatedUser): Promise<EvidenceItem[]> {
    const visibleCaseIds = await this.casesService.getVisibleCaseIds(actor);
    if (visibleCaseIds.length === 0) return [];

    return this.prisma.forCurrentTenant((tx) =>
      tx.evidenceItem.findMany({
        where: {
          caseId: { in: visibleCaseIds },
          OR: [{ legalHold: true }, { custodyEvents: { none: { action: 'HASH_VERIFIED' } } }],
        },
        orderBy: { collectedAt: 'desc' },
      }),
    );
  }

  private async assertItemOnCase(actor: AuthenticatedUser, caseId: string, evidenceId: string): Promise<EvidenceItem> {
    await this.casesService.getById(actor, caseId);
    const item = await this.prisma.forCurrentTenant((tx) => tx.evidenceItem.findUnique({ where: { id: evidenceId } }));
    if (!item || item.caseId !== caseId) {
      throw new NotFoundException('Evidence item not found on this case');
    }
    return item;
  }
}
