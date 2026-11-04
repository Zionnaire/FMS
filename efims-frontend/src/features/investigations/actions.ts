"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/session";
import type { FormState } from "@/lib/form-state";
import { parseActionError } from "@/lib/form-state";
import type { IntervieweeRole } from "./types";
import * as api from "./api";

function path(caseId: string) {
  return `/cases/${caseId}/investigations`;
}

export async function createInvestigationPlanAction(caseId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.createInvestigationPlan(accessToken, caseId, {
      objectives: String(formData.get("objectives") ?? ""),
      scope: String(formData.get("scope") ?? ""),
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}

export async function raiseIssueAction(caseId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.raiseIssue(accessToken, caseId, {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}

export async function resolveIssueAction(caseId: string, issueId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.resolveIssue(accessToken, caseId, issueId, String(formData.get("resolution") ?? ""));
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}

export async function recordInterviewAction(caseId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.recordInterview(accessToken, caseId, {
      intervieweeName: String(formData.get("intervieweeName") ?? ""),
      intervieweeRole: formData.get("intervieweeRole") as IntervieweeRole,
      intervieweeUserId: (formData.get("intervieweeUserId") as string) || undefined,
      conductedAt: String(formData.get("conductedAt") ?? ""),
      summary: String(formData.get("summary") ?? ""),
      notes: (formData.get("notes") as string) || undefined,
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}

export async function recordFindingAction(caseId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.recordFinding(accessToken, caseId, {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      supportingEvidence: (formData.get("supportingEvidence") as string) || undefined,
      resolvesIssueId: (formData.get("resolvesIssueId") as string) || undefined,
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}
