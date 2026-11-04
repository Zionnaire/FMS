"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/session";
import * as api from "./api";

export async function markNotificationReadAction(id: string): Promise<void> {
  const { accessToken } = await requireSession();
  await api.markNotificationRead(accessToken, id);
  revalidatePath("/notifications");
}
