/** Postgres error helpers (postgres.js, PGlite and Drizzle's wrapped errors all expose `code`). */
function pgCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code ?? e?.cause?.code;
}
function pgConstraint(error: unknown): string | undefined {
  const e = error as { constraint_name?: string; constraint?: string; cause?: { constraint_name?: string; constraint?: string } } | null;
  return e?.constraint_name ?? e?.constraint ?? e?.cause?.constraint_name ?? e?.cause?.constraint;
}

/** 23505 unique_violation. Pass an index name to match one specific constraint. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (pgCode(error) !== "23505") return false;
  return constraint ? (pgConstraint(error) ?? "").includes(constraint) : true;
}
export const isForeignKeyViolation = (error: unknown) => pgCode(error) === "23503";
export const isCheckViolation = (error: unknown) => pgCode(error) === "23514";

/** Full text of a database error including Drizzle's wrapped `cause` (its own message is just "Failed query: …"). */
export function dbErrorMessage(error: unknown): string {
  const parts: string[] = [];
  let e: unknown = error;
  for (let i = 0; i < 4 && e; i++) {
    parts.push((e as { message?: string }).message ?? String(e));
    e = (e as { cause?: unknown }).cause;
  }
  return parts.join(" | ");
}
