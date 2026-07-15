import type { LocalDatabase, SqlValue } from "../data/database";
import { createId, nowIso } from "../domain/models";

export async function nextNumber(db: LocalDatabase, purpose: "SALE" | "ORDER" | "REFUND") {
  const rows = await db.query<{ next_value: number; prefix: string }>("SELECT next_value, prefix FROM receipt_sequences WHERE purpose = ?", [purpose]);
  const sequence = rows[0];
  if (!sequence) throw new Error(`Missing ${purpose} receipt sequence.`);
  await db.run("UPDATE receipt_sequences SET next_value = next_value + 1 WHERE purpose = ?", [purpose], false);
  return `${sequence.prefix}-${String(sequence.next_value).padStart(6, "0")}`;
}

export async function audit(
  db: LocalDatabase,
  input: { actorId?: string | null; action: string; entityType: string; entityId?: string | null; reason?: string | null; metadata?: unknown }
) {
  await db.run(
    "INSERT INTO audit_logs(id, actor_id, action, entity_type, entity_id, reason, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [createId("audit"), input.actorId ?? null, input.action, input.entityType, input.entityId ?? null, input.reason ?? null, input.metadata ? JSON.stringify(input.metadata) : null, nowIso()],
    false
  );
}

export function placeholders(values: SqlValue[]) {
  return values.map(() => "?").join(", ");
}

export function asBoolean(value: unknown) {
  return Number(value) === 1;
}

