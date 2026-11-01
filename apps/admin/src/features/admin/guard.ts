import "server-only";
import { requireAdmin, type CurrentUser } from "@/lib/auth/session";
import { logAdminAction } from "@/services/audit.service";
import { getClientIp } from "@/lib/security/request";
import { toActionError, type ActionResult } from "@/lib/utilities/errors";

/**
 * Wraps an admin Server Action: verifies ADMIN against the database, runs the handler,
 * writes an audit log entry, and converts errors into a safe ActionResult.
 *
 *   export async function saveThing(input: X) {
 *     return adminAction({ action: "thing.update", entityType: "thing" }, async (admin) => { ...; return { data, entityId, summary } });
 *   }
 */
export async function adminAction<T>(
  meta: { action: string; entityType: string; audit?: boolean },
  handler: (admin: CurrentUser) => Promise<{ data?: T; entityId?: string; summary?: string; metadata?: Record<string, unknown> } | void>,
): Promise<ActionResult<T>> {
  try {
    const admin = await requireAdmin();
    const result = (await handler(admin)) ?? {};
    if (meta.audit !== false) {
      await logAdminAction(
        { id: admin.id, name: admin.name },
        { action: meta.action, entityType: meta.entityType, entityId: result.entityId, summary: result.summary, metadata: result.metadata, ip: await getClientIp().catch(() => undefined) },
      );
    }
    return { ok: true, data: result.data } as ActionResult<T>;
  } catch (error) {
    return toActionError(error);
  }
}
