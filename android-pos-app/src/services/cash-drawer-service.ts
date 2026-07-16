import type { LocalDatabase } from "../data/database";
import {
  denominationTotal,
  expectedCash,
  type CashMovementRecord,
  type CashMovementType,
  type CashSessionRecord,
  type DenominationCount
} from "../domain/cash-drawer";
import { createId, nowIso, type LocalUser } from "../domain/models";
import { audit } from "./service-helpers";

const registerId = "device_main";

type SessionRow = {
  id: string; register_id: string; business_date: string; opened_by_user_id: string; opened_by_name: string;
  closed_by_name: string | null; status: CashSessionRecord["status"]; opening_cash_cents: number;
  expected_cash_cents: number | null; actual_cash_cents: number | null; difference_cents: number | null;
  opening_notes: string | null; closing_notes: string | null; denomination_json: string | null;
  review_notes: string | null; review_resolution: string | null; opened_at: string; closed_at: string | null; reviewed_at: string | null;
};

function has(actor: LocalUser, permission: string) {
  return actor.permissions.includes("*") || actor.permissions.includes(permission);
}

function requireUse(actor: LocalUser) {
  if (!has(actor, "cash_drawer.use") && !has(actor, "cash_drawer.manage")) throw new Error("Cash drawer permission is required.");
}

function positiveMoney(value: number, label: string, allowZero = false) {
  if (!Number.isSafeInteger(value) || value < 0 || (!allowZero && value === 0)) throw new Error(`${label} must be a valid amount.`);
}

async function businessDate(db: LocalDatabase, at: string) {
  const rows = await db.query<{ value_json: string }>("SELECT value_json FROM settings WHERE key='app'");
  const timezone = rows[0] ? (JSON.parse(rows[0].value_json) as { businessTimezone?: string }).businessTimezone ?? "Asia/Manila" : "Asia/Manila";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(at));
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

async function actorRole(db: LocalDatabase, actorId: string) {
  const rows = await db.query<{ role_name: string }>("SELECT r.name AS role_name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.status='ACTIVE' AND u.deleted_at IS NULL", [actorId]);
  if (!rows[0]) throw new Error("The active user was not found.");
  return rows[0].role_name;
}

export async function requireOpenCashSession(db: LocalDatabase, actorId: string) {
  const rows = await db.query<{ id: string; opened_by_user_id: string }>("SELECT id, opened_by_user_id FROM cash_sessions WHERE register_id=? AND status='OPEN' LIMIT 1", [registerId]);
  const session = rows[0];
  if (!session) throw new Error("Open the cash drawer before accepting or returning cash.");
  if (session.opened_by_user_id !== actorId && (await actorRole(db, actorId)) === "CASHIER") throw new Error("This cash drawer belongs to another cashier. Close it before changing users.");
  return session.id;
}

export async function recordAutomaticCashMovement(db: LocalDatabase, input: {
  requestKey: string;
  actorId: string;
  type: "SALE" | "REFUND";
  amountCents: number;
  relatedId: string;
  reference: string;
  createdAt: string;
}) {
  if (input.amountCents <= 0) return null;
  const sessionId = await requireOpenCashSession(db, input.actorId);
  await db.run(
    `INSERT INTO cash_movements(id, request_key, cash_session_id, type, direction, amount_cents, reason, related_type, related_id, created_by_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [createId("cashmovement"), input.requestKey, sessionId, input.type, input.type === "SALE" ? 1 : -1, input.amountCents,
      input.type === "SALE" ? `Cash sale ${input.reference}` : `Cash refund ${input.reference}`, input.type === "SALE" ? "Sale" : "Refund", input.relatedId, input.actorId, input.createdAt],
    false
  );
  return sessionId;
}

export class CashDrawerService {
  constructor(private db: LocalDatabase) {}

  private async movements(sessionId: string): Promise<CashMovementRecord[]> {
    const rows = await this.db.query<{
      id: string; type: CashMovementType; direction: -1 | 1; amount_cents: number; reason: string; notes: string | null;
      related_type: string | null; related_id: string | null; created_by_name: string; created_at: string; reversed_at: string | null;
    }>(`SELECT m.id, m.type, m.direction, m.amount_cents, m.reason, m.notes, m.related_type, m.related_id,
       u.name AS created_by_name, m.created_at, m.reversed_at FROM cash_movements m
       JOIN users u ON u.id=m.created_by_user_id WHERE m.cash_session_id=? ORDER BY m.created_at, m.id`, [sessionId]);
    return rows.map((row) => ({ id: row.id, type: row.type, direction: row.direction, amountCents: Number(row.amount_cents), reason: row.reason,
      notes: row.notes, relatedType: row.related_type, relatedId: row.related_id, createdByName: row.created_by_name, createdAt: row.created_at, reversedAt: row.reversed_at }));
  }

  private async detail(actor: LocalUser, id: string): Promise<CashSessionRecord> {
    requireUse(actor);
    const rows = await this.db.query<SessionRow>(`SELECT s.*, opener.name AS opened_by_name, closer.name AS closed_by_name
      FROM cash_sessions s JOIN users opener ON opener.id=s.opened_by_user_id
      LEFT JOIN users closer ON closer.id=s.closed_by_user_id WHERE s.id=?`, [id]);
    const row = rows[0];
    if (!row) throw new Error("Cash session was not found.");
    if (actor.role === "CASHIER" && row.opened_by_user_id !== actor.id) throw new Error("Cashiers can only view their own cash sessions.");
    const movements = await this.movements(id);
    // Reversals are compensating entries; both the original and correction remain in the immutable ledger.
    const active = movements;
    const total = (type: CashMovementType) => active.filter((movement) => movement.type === type).reduce((sum, movement) => sum + movement.amountCents, 0);
    const correctionsCents = total("CORRECTION_IN") - total("CORRECTION_OUT");
    const computedExpected = expectedCash({ openingCashCents: Number(row.opening_cash_cents), cashSalesCents: total("SALE"), cashRefundsCents: total("REFUND"), cashInCents: total("CASH_IN"), cashOutCents: total("CASH_OUT"), correctionsCents });
    return {
      id: row.id, registerId: row.register_id, businessDate: row.business_date, openedByUserId: row.opened_by_user_id,
      openedByName: row.opened_by_name, closedByName: row.closed_by_name, status: row.status, openingCashCents: Number(row.opening_cash_cents),
      cashSalesCents: total("SALE"), cashRefundsCents: total("REFUND"), cashInCents: total("CASH_IN"), cashOutCents: total("CASH_OUT"), correctionsCents,
      expectedCashCents: row.expected_cash_cents === null ? computedExpected : Number(row.expected_cash_cents),
      actualCashCents: row.actual_cash_cents === null ? null : Number(row.actual_cash_cents), differenceCents: row.difference_cents === null ? null : Number(row.difference_cents),
      openingNotes: row.opening_notes, closingNotes: row.closing_notes,
      denominationCounts: row.denomination_json ? JSON.parse(row.denomination_json) as DenominationCount[] : [],
      reviewNotes: row.review_notes, reviewResolution: row.review_resolution, openedAt: row.opened_at, closedAt: row.closed_at, reviewedAt: row.reviewed_at, movements
    };
  }

  async current(actor: LocalUser) {
    requireUse(actor);
    const rows = await this.db.query<{ id: string; opened_by_user_id: string }>("SELECT id, opened_by_user_id FROM cash_sessions WHERE register_id=? AND status='OPEN' LIMIT 1", [registerId]);
    if (!rows[0]) return null;
    if (actor.role === "CASHIER" && rows[0].opened_by_user_id !== actor.id) return null;
    return this.detail(actor, rows[0].id);
  }

  async open(actor: LocalUser, input: { requestKey: string; openingCashCents: number; notes?: string }) {
    requireUse(actor);
    positiveMoney(input.openingCashCents, "Opening cash", true);
    const existing = await this.db.query<{ id: string }>("SELECT id FROM cash_sessions WHERE request_key=?", [input.requestKey]);
    if (existing[0]) return this.detail(actor, existing[0].id);
    const id = createId("cashsession");
    const now = nowIso();
    await this.db.transaction(async () => {
      const openRows = await this.db.query<{ opened_by_user_id: string }>("SELECT opened_by_user_id FROM cash_sessions WHERE register_id=? AND status='OPEN'", [registerId]);
      if (openRows[0]) throw new Error(openRows[0].opened_by_user_id === actor.id ? "Your cash drawer is already open." : "Another cashier already has an open cash drawer.");
      await this.db.run(`INSERT INTO cash_sessions(id, request_key, register_id, business_date, opened_by_user_id, opening_cash_cents, opening_notes, opened_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, input.requestKey, registerId, await businessDate(this.db, now), actor.id, input.openingCashCents, input.notes?.trim() || null, now, now, now], false);
      await audit(this.db, { actorId: actor.id, action: "CASH_DRAWER_OPENED", entityType: "CashSession", entityId: id, metadata: { openingCashCents: input.openingCashCents } });
    });
    return this.detail(actor, id);
  }

  async addMovement(actor: LocalUser, input: { requestKey: string; type: "CASH_IN" | "CASH_OUT"; amountCents: number; reason: string; notes?: string }) {
    requireUse(actor);
    positiveMoney(input.amountCents, "Cash amount");
    if (input.reason.trim().length < 3) throw new Error("Select or enter a reason.");
    if (input.reason.trim() === "Other" && (input.notes?.trim().length ?? 0) < 3) throw new Error("Enter details for the cash movement reason.");
    const existing = await this.db.query<{ cash_session_id: string }>("SELECT cash_session_id FROM cash_movements WHERE request_key=?", [input.requestKey]);
    if (existing[0]) return this.detail(actor, existing[0].cash_session_id);
    const sessionId = await requireOpenCashSession(this.db, actor.id);
    const now = nowIso();
    await this.db.transaction(async () => {
      await this.db.run(`INSERT INTO cash_movements(id, request_key, cash_session_id, type, direction, amount_cents, reason, notes, created_by_user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [createId("cashmovement"), input.requestKey, sessionId, input.type, input.type === "CASH_IN" ? 1 : -1, input.amountCents, input.reason.trim(), input.notes?.trim() || null, actor.id, now], false);
      await audit(this.db, { actorId: actor.id, action: input.type, entityType: "CashSession", entityId: sessionId, reason: input.reason, metadata: { amountCents: input.amountCents } });
    });
    return this.detail(actor, sessionId);
  }

  async close(actor: LocalUser, input: { requestKey: string; actualCashCents: number; notes?: string; denominations?: DenominationCount[] }) {
    requireUse(actor);
    positiveMoney(input.actualCashCents, "Actual cash", true);
    if (input.denominations?.some((item) => !Number.isSafeInteger(item.valueCents) || item.valueCents <= 0 || !Number.isSafeInteger(item.quantity) || item.quantity < 0)) throw new Error("Denomination counts must be valid whole numbers.");
    if (input.denominations?.length && denominationTotal(input.denominations) !== input.actualCashCents) throw new Error("The denomination count does not match actual cash.");
    const duplicate = await this.db.query<{ id: string }>("SELECT id FROM cash_sessions WHERE close_request_key=?", [input.requestKey]);
    if (duplicate[0]) return this.detail(actor, duplicate[0].id);
    const session = await this.current(actor);
    if (!session) throw new Error("There is no open cash drawer for this user.");
    const now = nowIso();
    const difference = input.actualCashCents - session.expectedCashCents;
    await this.db.transaction(async () => {
      const changed = await this.db.run(`UPDATE cash_sessions SET close_request_key=?, status=?, expected_cash_cents=?, actual_cash_cents=?, difference_cents=?,
        closing_notes=?, denomination_json=?, closed_by_user_id=?, closed_at=?, updated_at=? WHERE id=? AND status='OPEN'`,
      [input.requestKey, difference === 0 ? "CLOSED" : "REVIEW_REQUIRED", session.expectedCashCents, input.actualCashCents, difference, input.notes?.trim() || null,
        input.denominations?.length ? JSON.stringify(input.denominations) : null, actor.id, now, now, session.id], false);
      if (Number(changed.changes?.changes ?? 0) !== 1) throw new Error("The cash drawer was already closed.");
      await audit(this.db, { actorId: actor.id, action: "CASH_DRAWER_CLOSED", entityType: "CashSession", entityId: session.id, metadata: { expectedCashCents: session.expectedCashCents, actualCashCents: input.actualCashCents, differenceCents: difference } });
    });
    return this.detail(actor, session.id);
  }

  async history(actor: LocalUser, input: { fromDate?: string; toDate?: string; status?: string } = {}) {
    requireUse(actor);
    const clauses = ["1=1"];
    const values: Array<string | number | null> = [];
    if (actor.role === "CASHIER") { clauses.push("opened_by_user_id=?"); values.push(actor.id); }
    if (input.fromDate) { clauses.push("business_date>=?"); values.push(input.fromDate); }
    if (input.toDate) { clauses.push("business_date<=?"); values.push(input.toDate); }
    if (input.status) { clauses.push("status=?"); values.push(input.status); }
    const rows = await this.db.query<{ id: string }>(`SELECT id FROM cash_sessions WHERE ${clauses.join(" AND ")} ORDER BY opened_at DESC LIMIT 500`, values);
    return Promise.all(rows.map((row) => this.detail(actor, row.id)));
  }

  async reverseManualMovement(actor: LocalUser, input: { requestKey: string; movementId: string; reason: string }) {
    if (!has(actor, "cash_drawer.manage")) throw new Error("Cash drawer management permission is required.");
    if (input.reason.trim().length < 3) throw new Error("A correction reason is required.");
    const duplicate = await this.db.query<{ cash_session_id: string }>("SELECT cash_session_id FROM cash_movements WHERE request_key=?", [input.requestKey]);
    if (duplicate[0]) return this.detail(actor, duplicate[0].cash_session_id);
    const rows = await this.db.query<{ cash_session_id: string; type: "CASH_IN" | "CASH_OUT"; amount_cents: number; reversed_at: string | null; status: string }>(
      `SELECT m.cash_session_id, m.type, m.amount_cents, m.reversed_at, s.status FROM cash_movements m
       JOIN cash_sessions s ON s.id=m.cash_session_id WHERE m.id=? AND m.type IN ('CASH_IN','CASH_OUT')`, [input.movementId]
    );
    const movement = rows[0];
    if (!movement) throw new Error("Only manual cash movements can be corrected.");
    if (movement.status !== "OPEN") throw new Error("Closed cash sessions cannot be changed. Record the discrepancy during review.");
    if (movement.reversed_at) throw new Error("This cash movement already has a correction.");
    const now = nowIso();
    await this.db.transaction(async () => {
      await this.db.run(`INSERT INTO cash_movements(id, request_key, cash_session_id, type, direction, amount_cents, reason, notes, created_by_user_id, reverses_movement_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [createId("cashmovement"), input.requestKey, movement.cash_session_id,
        movement.type === "CASH_IN" ? "CORRECTION_OUT" : "CORRECTION_IN", movement.type === "CASH_IN" ? -1 : 1, Number(movement.amount_cents),
        "Manager correction", input.reason.trim(), actor.id, input.movementId, now], false);
      await this.db.run("UPDATE cash_movements SET reversed_at=?, reversed_by_user_id=? WHERE id=? AND reversed_at IS NULL", [now, actor.id, input.movementId], false);
      await audit(this.db, { actorId: actor.id, action: "CASH_MOVEMENT_CORRECTED", entityType: "CashMovement", entityId: input.movementId, reason: input.reason, metadata: { amountCents: Number(movement.amount_cents) } });
    });
    return this.detail(actor, movement.cash_session_id);
  }

  async review(actor: LocalUser, input: { sessionId: string; resolution: string; notes: string }) {
    if (!has(actor, "cash_drawer.review")) throw new Error("Cash drawer review permission is required.");
    if (input.resolution.trim().length < 3 || input.notes.trim().length < 3) throw new Error("A review resolution and notes are required.");
    const now = nowIso();
    await this.db.transaction(async () => {
      const changed = await this.db.run("UPDATE cash_sessions SET status='REVIEWED', review_resolution=?, review_notes=?, reviewed_by_user_id=?, reviewed_at=?, updated_at=? WHERE id=? AND status='REVIEW_REQUIRED'",
        [input.resolution.trim(), input.notes.trim(), actor.id, now, now, input.sessionId], false);
      if (Number(changed.changes?.changes ?? 0) !== 1) throw new Error("Only a session awaiting review can be reviewed.");
      await audit(this.db, { actorId: actor.id, action: "CASH_DRAWER_REVIEWED", entityType: "CashSession", entityId: input.sessionId, reason: input.notes, metadata: { resolution: input.resolution } });
    });
    return this.detail(actor, input.sessionId);
  }
}
