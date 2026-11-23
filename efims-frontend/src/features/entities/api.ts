import "server-only";
import { backendFetch } from "@/lib/backend-client";
import type {
  Entity,
  EntityCaseLinkRole,
  EntityDetail,
  EntityGraph,
  EntityIdentifier,
  EntityIdentifierType,
  EntityRelationship,
  EntityRelationshipType,
  EntityRiskAssessment,
  EntityType,
  RiskBand,
  RiskFactor,
  VisibleCaseLink,
} from "./types";

export interface ListEntitiesParams {
  accessToken: string;
  type?: EntityType;
  watchlisted?: boolean;
  search?: string;
}

export async function listEntities({ accessToken, type, watchlisted, search }: ListEntitiesParams): Promise<Entity[]> {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (watchlisted !== undefined) params.set("watchlisted", String(watchlisted));
  if (search) params.set("search", search);
  const query = params.toString();
  return backendFetch<Entity[]>(`/entities${query ? `?${query}` : ""}`, { accessToken });
}

export async function getEntity(accessToken: string, id: string): Promise<EntityDetail> {
  return backendFetch<EntityDetail>(`/entities/${id}`, { accessToken });
}

export interface CreateEntityInput {
  type: EntityType;
  displayName: string;
}

export async function createEntity(accessToken: string, input: CreateEntityInput): Promise<Entity> {
  return backendFetch<Entity>("/entities", { method: "POST", body: input, accessToken });
}

export async function updateEntity(accessToken: string, id: string, displayName: string): Promise<Entity> {
  return backendFetch<Entity>(`/entities/${id}`, { method: "PATCH", body: { displayName }, accessToken });
}

export async function deleteEntity(accessToken: string, id: string): Promise<void> {
  await backendFetch<void>(`/entities/${id}`, { method: "DELETE", accessToken });
}

export async function addIdentifier(accessToken: string, entityId: string, type: EntityIdentifierType, value: string): Promise<EntityIdentifier> {
  return backendFetch<EntityIdentifier>(`/entities/${entityId}/identifiers`, { method: "POST", body: { type, value }, accessToken });
}

export async function addRelationship(
  accessToken: string,
  entityId: string,
  toEntityId: string,
  relationshipType: EntityRelationshipType,
  rationale?: string,
): Promise<EntityRelationship> {
  return backendFetch<EntityRelationship>(`/entities/${entityId}/relationships`, {
    method: "POST",
    body: { toEntityId, relationshipType, rationale },
    accessToken,
  });
}

export async function removeRelationship(accessToken: string, entityId: string, relationshipId: string): Promise<void> {
  await backendFetch<void>(`/entities/${entityId}/relationships/${relationshipId}`, { method: "DELETE", accessToken });
}

export async function getEntityGraph(accessToken: string, entityId: string, depth = 2): Promise<EntityGraph> {
  return backendFetch<EntityGraph>(`/entities/${entityId}/graph?depth=${depth}`, { accessToken });
}

export async function linkCase(accessToken: string, entityId: string, caseId: string, role: EntityCaseLinkRole): Promise<VisibleCaseLink> {
  return backendFetch<VisibleCaseLink>(`/entities/${entityId}/case-links`, { method: "POST", body: { caseId, role }, accessToken });
}

export async function unlinkCase(accessToken: string, entityId: string, caseId: string): Promise<void> {
  await backendFetch<void>(`/entities/${entityId}/case-links/${caseId}`, { method: "DELETE", accessToken });
}

export async function recordRiskAssessment(accessToken: string, entityId: string, band: RiskBand, factors: RiskFactor[]): Promise<EntityRiskAssessment> {
  return backendFetch<EntityRiskAssessment>(`/entities/${entityId}/risk-assessments`, { method: "POST", body: { band, factors }, accessToken });
}

export async function setWatchlist(accessToken: string, entityId: string, watchlisted: boolean, reason?: string): Promise<Entity> {
  return backendFetch<Entity>(`/entities/${entityId}/watchlist`, { method: "POST", body: { watchlisted, reason }, accessToken });
}
