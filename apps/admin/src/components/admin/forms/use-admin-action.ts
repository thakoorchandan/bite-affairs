"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { ActionResult } from "@/lib/utilities/errors";

/**
 * Runs an admin Server Action with consistent UX: pending state, success/error toasts,
 * server field errors mapped onto the form, and a router refresh so server data reloads.
 */
export function useAdminAction() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T,>(
      action: () => Promise<ActionResult<T>>,
      opts: { success?: string | ((data: T) => string); refresh?: boolean; setError?: UseFormSetError<FieldValues> } = {},
    ): Promise<ActionResult<T>> => {
      setBusy(true);
      try {
        const res = await action();
        if (res.ok) {
          const msg = typeof opts.success === "function" ? opts.success((res as { data: T }).data) : opts.success;
          if (msg) toast.success(msg);
          if (opts.refresh !== false) startTransition(() => router.refresh());
        } else {
          toast.error(res.error);
          if (opts.setError && res.fieldErrors) {
            for (const [key, messages] of Object.entries(res.fieldErrors)) {
              if (messages?.[0] && key !== "_") opts.setError(key as Path<FieldValues>, { type: "server", message: messages[0] });
            }
          }
        }
        return res;
      } catch {
        toast.error("Network error — please try again.");
        return { ok: false, error: "Network error" };
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  return { run, pending: busy || isPending };
}

export const paiseToInput = (paise: number | null | undefined) => (paise == null ? "" : (paise / 100).toFixed(paise % 100 ? 2 : 0));
