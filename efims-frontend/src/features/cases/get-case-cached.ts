import { cache } from "react";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/backend-client";
import { getCase } from "./api";
import type { Case } from "./types";

/** `cache()` memoizes this for the duration of one request/render pass — both `cases/[id]/
 * layout.tsx` (header/tabs) and each tab's own `page.tsx` call this, but it only hits the
 * backend once per request, not once per caller. Standard Next.js pattern for sharing a fetch
 * between a layout and its children without prop-drilling or a second round trip. */
export const getCaseCached = cache(async (accessToken: string, id: string): Promise<Case> => {
  try {
    return await getCase(accessToken, id);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }
});
