"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { ComponentProps } from "react";

/** Shared submit button for every Server-Action form in this app — shows a pending state via
 * `useFormStatus`, which only works inside the `<form>` it's rendered in (a client component
 * boundary, since `useFormStatus` is a hook). */
export function SubmitButton({ children, pendingText, ...props }: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? (pendingText ?? "Saving…") : children}
    </Button>
  );
}
