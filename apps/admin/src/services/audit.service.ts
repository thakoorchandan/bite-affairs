import { getDb, schema } from "@/db";
import { isUuid } from "@/db";

export interface AuditActor {
  id: string;
  name?: string;
}

export async function logAdminAction(actor: AuditActor, entry: { action: string; entityType: string; entityId?: string; summary?: string; metadata?: Record<string, unknown>; ip?: string }) {
  try {
    const db = await getDb();
    await db.insert(schema.adminActivityLogs).values({
      actorId: isUuid(actor.id) ? actor.id : null,
      actorName: actor.name ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary ?? null,
      metadata: entry.metadata ?? null,
      ip: entry.ip ?? null,
    });
  } catch (error) {
    // Auditing must never block the operation itself, but failures are visible in logs.
    console.error("[audit] failed to record admin action", error);
  }
}
