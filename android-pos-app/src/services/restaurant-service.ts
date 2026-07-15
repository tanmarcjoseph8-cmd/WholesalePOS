import type { LocalDatabase } from "../data/database";
import { createId, nowIso, type LocalUser, type OrderLine, type OrderRecord, type OrderStatus, type OrderType, type RestaurantTableRecord, type UnitCode } from "../domain/models";
import { audit, asBoolean, nextNumber, placeholders } from "./service-helpers";

const reservingStatuses: OrderStatus[] = ["CONFIRMED", "PREPARING", "READY", "SERVED"];

type OrderRow = {
  id: string;
  order_number: string;
  order_type: OrderType;
  custom_order_type: string | null;
  status: OrderStatus;
  customer_name: string | null;
  guest_count: number;
  notes: string | null;
  primary_table_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export class RestaurantService {
  constructor(private db: LocalDatabase) {}

  private requirePermission(actor: LocalUser, permission: "orders.manage" | "tables.manage") {
    if (!actor.permissions.includes("*") && !actor.permissions.includes(permission)) throw new Error(`${permission === "tables.manage" ? "Table" : "Order"} management permission is required.`);
  }

  async listTables(includeInactive = false) {
    const rows = await this.db.query<{
      id: string; number: string; section: string; capacity: number; status: RestaurantTableRecord["status"]; guest_count: number;
      active_order_id: string | null; active_order_number: string | null; is_active: number; version: number;
    }>(
      `SELECT t.id, t.number, t.section, t.capacity, t.status, t.guest_count, t.active_order_id, o.order_number AS active_order_number, t.is_active, t.version
       FROM restaurant_tables t LEFT JOIN orders o ON o.id=t.active_order_id
       WHERE t.deleted_at IS NULL AND (?=1 OR t.is_active=1) ORDER BY t.section, t.number`,
      [includeInactive ? 1 : 0]
    );
    return rows.map((row) => ({ id: row.id, number: row.number, section: row.section, capacity: Number(row.capacity), status: row.status, guestCount: Number(row.guest_count), activeOrderId: row.active_order_id, activeOrderNumber: row.active_order_number, isActive: asBoolean(row.is_active), version: Number(row.version) }));
  }

  async saveTable(actor: LocalUser, input: { id?: string; number: string; section: string; capacity: number; status?: RestaurantTableRecord["status"] }) {
    this.requirePermission(actor, "tables.manage");
    if (!input.number.trim() || input.capacity < 1) throw new Error("Table number and capacity are required.");
    const id = input.id ?? createId("table");
    const now = nowIso();
    await this.db.transaction(async () => {
      if (input.id) {
        const active = await this.db.query<{ active_order_id: string | null }>("SELECT active_order_id FROM restaurant_tables WHERE id=?", [id]);
        if (active[0]?.active_order_id && input.status && input.status !== "OCCUPIED") throw new Error("Move or close the active order before changing this table status.");
        await this.db.run("UPDATE restaurant_tables SET number=?, section=?, capacity=?, status=COALESCE(?,status), updated_at=?, version=version+1 WHERE id=? AND deleted_at IS NULL", [input.number.trim(), input.section.trim() || "Main", input.capacity, input.status ?? null, now, id], false);
      } else {
        await this.db.run("INSERT INTO restaurant_tables(id, number, section, capacity, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, input.number.trim(), input.section.trim() || "Main", input.capacity, input.status ?? "AVAILABLE", now, now], false);
      }
      await audit(this.db, { actorId: actor.id, action: input.id ? "TABLE_UPDATED" : "TABLE_CREATED", entityType: "RestaurantTable", entityId: id });
    });
  }

  async setTableActive(actor: LocalUser, id: string, active: boolean, reason: string) {
    this.requirePermission(actor, "tables.manage");
    if (reason.trim().length < 3) throw new Error("A reason is required.");
    await this.db.transaction(async () => {
      const rows = await this.db.query<{ active_order_id: string | null }>("SELECT active_order_id FROM restaurant_tables WHERE id=? AND deleted_at IS NULL", [id]);
      if (!rows[0]) throw new Error("Table was not found.");
      if (!active && rows[0].active_order_id) throw new Error("Move or cancel the active order before deactivating this table.");
      await this.db.run("UPDATE restaurant_tables SET is_active=?, status=?, updated_at=?, version=version+1 WHERE id=?", [active ? 1 : 0, active ? "AVAILABLE" : "UNAVAILABLE", nowIso(), id], false);
      await audit(this.db, { actorId: actor.id, action: active ? "TABLE_RESTORED" : "TABLE_DEACTIVATED", entityType: "RestaurantTable", entityId: id, reason });
    });
  }

  private async replaceItems(orderId: string, lines: OrderLine[]) {
    const now = nowIso();
    await this.db.run("UPDATE order_items SET deleted_at=?, updated_at=? WHERE order_id=? AND deleted_at IS NULL", [now, now, orderId], false);
    for (const line of lines) {
      await this.db.run(
        `INSERT INTO order_items(id, order_id, product_id, warehouse_id, sold_quantity_micro, sold_unit, base_quantity_micro,
         unit_price_cents, discount_cents, tax_basis_points, note, created_at, updated_at) VALUES (?, ?, ?, 'warehouse_main', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [createId("orderitem"), orderId, line.productId, line.soldQuantityMicro, line.soldUnit, line.baseQuantityMicro, line.unitPriceCents, line.discountCents, line.taxBasisPoints, line.note ?? null, now, now],
        false
      );
    }
  }

  private async syncReservations(orderId: string, status: OrderStatus) {
    const now = nowIso();
    await this.db.run("UPDATE inventory_reservations SET status='RELEASED', updated_at=? WHERE order_id=? AND status='ACTIVE'", [now, orderId], false);
    if (!reservingStatuses.includes(status)) return;
    const items = await this.db.query<{ id: string; product_id: string; warehouse_id: string; base_quantity_micro: number; product_name: string }>(
      "SELECT oi.id, oi.product_id, oi.warehouse_id, oi.base_quantity_micro, p.name AS product_name FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=? AND oi.deleted_at IS NULL",
      [orderId]
    );
    for (const item of items) {
      const balances = await this.db.query<{ physical_micro: number; reserved_micro: number }>(
        `SELECT COALESCE(s.quantity_micro,0) AS physical_micro,
          COALESCE((SELECT SUM(quantity_micro) FROM inventory_reservations WHERE product_id=? AND warehouse_id=? AND status='ACTIVE' AND order_id<>?),0) AS reserved_micro
         FROM inventory_stock s WHERE s.product_id=? AND s.warehouse_id=?`,
        [item.product_id, item.warehouse_id, orderId, item.product_id, item.warehouse_id]
      );
      const available = Number(balances[0]?.physical_micro ?? 0) - Number(balances[0]?.reserved_micro ?? 0);
      if (Number(item.base_quantity_micro) > available) throw new Error(`${item.product_name} has insufficient available stock for confirmation.`);
      await this.db.run(
        "INSERT INTO inventory_reservations(id, order_id, order_item_id, product_id, warehouse_id, quantity_micro, status, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 'Confirmed restaurant order', ?, ?)",
        [createId("reservation"), orderId, item.id, item.product_id, item.warehouse_id, item.base_quantity_micro, now, now],
        false
      );
    }
  }

  private async assignTables(orderId: string, tableIds: string[], primaryTableId: string | null, guestCount: number) {
    const uniqueIds = [...new Set(tableIds)];
    if (primaryTableId && !uniqueIds.includes(primaryTableId)) throw new Error("The primary table must be selected.");
    if (uniqueIds.length) {
      const rows = await this.db.query<{ id: string; active_order_id: string | null; is_active: number }>(`SELECT id, active_order_id, is_active FROM restaurant_tables WHERE id IN (${placeholders(uniqueIds)})`, uniqueIds);
      if (rows.length !== uniqueIds.length || rows.some((table) => !asBoolean(table.is_active))) throw new Error("A selected table is unavailable.");
      if (rows.some((table) => table.active_order_id && table.active_order_id !== orderId)) throw new Error("A selected table already has an active order.");
    }
    const now = nowIso();
    await this.db.run("UPDATE restaurant_tables SET active_order_id=NULL, status='AVAILABLE', guest_count=0, updated_at=?, version=version+1 WHERE active_order_id=?", [now, orderId], false);
    await this.db.run("DELETE FROM order_tables WHERE order_id=?", [orderId], false);
    for (const tableId of uniqueIds) {
      await this.db.run("INSERT INTO order_tables(order_id, table_id, is_primary) VALUES (?, ?, ?)", [orderId, tableId, tableId === primaryTableId ? 1 : 0], false);
      await this.db.run("UPDATE restaurant_tables SET active_order_id=?, status='OCCUPIED', guest_count=?, updated_at=?, version=version+1 WHERE id=?", [orderId, guestCount, now, tableId], false);
    }
  }

  async createOrder(actor: LocalUser, input: { requestKey: string; orderType: OrderType; customOrderType?: string | null; customerName?: string | null; guestCount: number; notes?: string | null; tableIds?: string[]; primaryTableId?: string | null; lines?: OrderLine[] }) {
    this.requirePermission(actor, "orders.manage");
    const repeated = await this.db.query<{ id: string }>("SELECT id FROM orders WHERE request_key=?", [input.requestKey]);
    if (repeated[0]) return this.getOrder(repeated[0].id);
    const id = createId("order");
    await this.db.transaction(async () => {
      const orderNumber = await nextNumber(this.db, "ORDER");
      const now = nowIso();
      await this.db.run(
        "INSERT INTO orders(id, request_key, order_number, order_type, custom_order_type, cashier_id, customer_name, guest_count, primary_table_id, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [id, input.requestKey, orderNumber, input.orderType, input.customOrderType ?? null, actor.id, input.customerName ?? null, input.guestCount, input.primaryTableId ?? null, input.notes ?? null, now, now],
        false
      );
      await this.replaceItems(id, input.lines ?? []);
      await this.assignTables(id, input.tableIds ?? [], input.primaryTableId ?? null, input.guestCount);
      await audit(this.db, { actorId: actor.id, action: "ORDER_CREATED", entityType: "Order", entityId: id, metadata: { orderType: input.orderType } });
    });
    return this.getOrder(id);
  }

  async updateOrder(actor: LocalUser, input: { id: string; expectedVersion: number; status: OrderStatus; customerName?: string | null; guestCount: number; notes?: string | null; lines: OrderLine[]; tableIds: string[]; primaryTableId: string | null }) {
    this.requirePermission(actor, "orders.manage");
    await this.db.transaction(async () => {
      const previous = await this.getOrder(input.id);
      if (previous.version !== input.expectedVersion) throw new Error("This order changed. Reload it before saving.");
      if (["COMPLETED", "CANCELLED"].includes(previous.status)) throw new Error("This order is closed.");
      const now = nowIso();
      const changed = await this.db.run(
        "UPDATE orders SET status=?, customer_name=?, guest_count=?, notes=?, primary_table_id=?, version=version+1, updated_at=? WHERE id=? AND version=?",
        [input.status, input.customerName ?? null, input.guestCount, input.notes ?? null, input.primaryTableId, now, input.id, input.expectedVersion],
        false
      );
      if (Number(changed.changes?.changes ?? 0) !== 1) throw new Error("This order changed. Reload it before saving.");
      await this.replaceItems(input.id, input.lines);
      await this.assignTables(input.id, input.tableIds, input.primaryTableId, input.guestCount);
      await this.syncReservations(input.id, input.status);
      await audit(this.db, { actorId: actor.id, action: "ORDER_UPDATED", entityType: "Order", entityId: input.id, metadata: { previousLines: previous.lines, nextLines: input.lines, previousStatus: previous.status, nextStatus: input.status } });
    });
    return this.getOrder(input.id);
  }

  async cancelOrder(actor: LocalUser, id: string, expectedVersion: number, reason: string) {
    this.requirePermission(actor, "orders.manage");
    if (reason.trim().length < 3) throw new Error("A cancellation reason is required.");
    await this.db.transaction(async () => {
      const now = nowIso();
      const changed = await this.db.run("UPDATE orders SET status='CANCELLED', cancellation_reason=?, cancelled_at=?, updated_at=?, version=version+1 WHERE id=? AND version=? AND status NOT IN ('COMPLETED','CANCELLED')", [reason.trim(), now, now, id, expectedVersion], false);
      if (Number(changed.changes?.changes ?? 0) !== 1) throw new Error("This order changed or is already closed.");
      await this.db.run("UPDATE inventory_reservations SET status='RELEASED', updated_at=? WHERE order_id=? AND status='ACTIVE'", [now, id], false);
      await this.db.run("UPDATE restaurant_tables SET active_order_id=NULL, status='AVAILABLE', guest_count=0, updated_at=?, version=version+1 WHERE active_order_id=?", [now, id], false);
      await audit(this.db, { actorId: actor.id, action: "ORDER_CANCELLED", entityType: "Order", entityId: id, reason });
    });
  }

  async transferOrder(actor: LocalUser, id: string, expectedVersion: number, tableIds: string[], primaryTableId: string, reason: string) {
    this.requirePermission(actor, "orders.manage");
    if (reason.trim().length < 3) throw new Error("A transfer reason is required.");
    await this.db.transaction(async () => {
      const order = await this.getOrder(id);
      if (order.version !== expectedVersion) throw new Error("This order changed. Reload it before transferring.");
      await this.assignTables(id, tableIds, primaryTableId, order.guestCount);
      await this.db.run("UPDATE orders SET primary_table_id=?, version=version+1, updated_at=? WHERE id=? AND version=?", [primaryTableId, nowIso(), id, expectedVersion], false);
      await audit(this.db, { actorId: actor.id, action: "ORDER_TABLES_TRANSFERRED", entityType: "Order", entityId: id, reason, metadata: { previous: order.tableIds, next: tableIds } });
    });
    return this.getOrder(id);
  }

  async mergeOrders(actor: LocalUser, targetId: string, targetVersion: number, sourceId: string, sourceVersion: number, reason: string) {
    this.requirePermission(actor, "orders.manage");
    if (reason.trim().length < 3) throw new Error("A merge reason is required.");
    if (targetId === sourceId) throw new Error("Select two different orders.");
    await this.db.transaction(async () => {
      const target = await this.getOrder(targetId);
      const source = await this.getOrder(sourceId);
      if (target.version !== targetVersion || source.version !== sourceVersion) throw new Error("An order changed. Reload before merging.");
      const mergedLines = [...target.lines];
      for (const sourceLine of source.lines) {
        const existing = mergedLines.find((line) => line.productId === sourceLine.productId && line.soldUnit === sourceLine.soldUnit && line.unitPriceCents === sourceLine.unitPriceCents);
        if (existing) {
          existing.soldQuantityMicro += sourceLine.soldQuantityMicro;
          existing.baseQuantityMicro += sourceLine.baseQuantityMicro;
          existing.discountCents += sourceLine.discountCents;
        } else mergedLines.push({ ...sourceLine, id: undefined });
      }
      await this.replaceItems(targetId, mergedLines);
      const now = nowIso();
      await this.db.run(
        "UPDATE restaurant_tables SET active_order_id=NULL, status='AVAILABLE', guest_count=0, updated_at=?, version=version+1 WHERE active_order_id=?",
        [now, sourceId],
        false
      );
      await this.assignTables(targetId, [...new Set([...target.tableIds, ...source.tableIds])], target.primaryTableId ?? source.primaryTableId, target.guestCount + source.guestCount);
      await this.db.run("UPDATE orders SET version=version+1, guest_count=?, updated_at=? WHERE id=? AND version=?", [target.guestCount + source.guestCount, now, targetId, targetVersion], false);
      await this.db.run("UPDATE orders SET status='CANCELLED', merged_into_order_id=?, cancellation_reason=?, cancelled_at=?, updated_at=?, version=version+1 WHERE id=? AND version=?", [targetId, reason.trim(), now, now, sourceId, sourceVersion], false);
      await this.db.run("DELETE FROM order_tables WHERE order_id=?", [sourceId], false);
      await this.db.run("UPDATE inventory_reservations SET status='RELEASED', updated_at=? WHERE order_id=? AND status='ACTIVE'", [now, sourceId], false);
      await this.syncReservations(targetId, target.status);
      await audit(this.db, { actorId: actor.id, action: "ORDERS_MERGED", entityType: "Order", entityId: targetId, reason, metadata: { sourceId } });
    });
    return this.getOrder(targetId);
  }

  async splitOrder(actor: LocalUser, sourceId: string, expectedVersion: number, quantities: Array<{ orderItemId: string; soldQuantityMicro: number }>, reason: string) {
    this.requirePermission(actor, "orders.manage");
    if (reason.trim().length < 3) throw new Error("A split reason is required.");
    const source = await this.getOrder(sourceId);
    if (source.version !== expectedVersion) throw new Error("This order changed. Reload before splitting.");
    const splitLines: OrderLine[] = [];
    const remainingLines: OrderLine[] = [];
    for (const line of source.lines) {
      const requested = quantities.find((entry) => entry.orderItemId === line.id)?.soldQuantityMicro ?? 0;
      if (requested < 0 || requested > line.soldQuantityMicro) throw new Error("A split quantity is invalid.");
      if (requested > 0) {
        const ratio = requested / line.soldQuantityMicro;
        splitLines.push({ ...line, id: undefined, soldQuantityMicro: requested, baseQuantityMicro: Math.round(line.baseQuantityMicro * ratio), discountCents: Math.round(line.discountCents * ratio) });
      }
      const remaining = line.soldQuantityMicro - requested;
      if (remaining > 0) {
        const ratio = remaining / line.soldQuantityMicro;
        remainingLines.push({ ...line, id: undefined, soldQuantityMicro: remaining, baseQuantityMicro: Math.round(line.baseQuantityMicro * ratio), discountCents: Math.round(line.discountCents * ratio) });
      }
    }
    if (!splitLines.length || !remainingLines.length) throw new Error("A split must leave items on both orders.");
    const splitId = createId("order");
    await this.db.transaction(async () => {
      const now = nowIso();
      const number = await nextNumber(this.db, "ORDER");
      await this.db.run(
        `INSERT INTO orders(id, request_key, order_number, order_type, custom_order_type, status, cashier_id, customer_name, guest_count,
         notes, service_charge_cents, tip_cents, split_from_order_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, 0, ?, ?, ?)`,
        [splitId, createId("splitrequest"), number, source.orderType, source.customOrderType, source.status, actor.id, source.customerName, `Split from ${source.orderNumber}`, sourceId, now, now],
        false
      );
      await this.replaceItems(sourceId, remainingLines);
      await this.replaceItems(splitId, splitLines);
      await this.db.run("UPDATE orders SET version=version+1, updated_at=? WHERE id=? AND version=?", [now, sourceId, expectedVersion], false);
      await this.syncReservations(sourceId, source.status);
      await this.syncReservations(splitId, source.status);
      await audit(this.db, { actorId: actor.id, action: "ORDER_SPLIT", entityType: "Order", entityId: sourceId, reason, metadata: { splitId, quantities } });
    });
    return { source: await this.getOrder(sourceId), split: await this.getOrder(splitId) };
  }

  async undoLastItemChange(actor: LocalUser, id: string, expectedVersion: number, reason: string) {
    this.requirePermission(actor, "orders.manage");
    if (reason.trim().length < 3) throw new Error("An undo reason is required.");
    const rows = await this.db.query<{ metadata_json: string }>("SELECT metadata_json FROM audit_logs WHERE entity_type='Order' AND entity_id=? AND action='ORDER_UPDATED' AND metadata_json IS NOT NULL ORDER BY created_at DESC LIMIT 1", [id]);
    const metadata = rows[0] ? JSON.parse(rows[0].metadata_json) as { previousLines?: OrderLine[] } : null;
    if (!metadata?.previousLines) throw new Error("No saved item change is available to undo.");
    const order = await this.getOrder(id);
    return this.updateOrder(actor, { id, expectedVersion, status: order.status, customerName: order.customerName, guestCount: order.guestCount, notes: order.notes, lines: metadata.previousLines, tableIds: order.tableIds, primaryTableId: order.primaryTableId });
  }

  async listOrders(includeClosed = false) {
    const rows = await this.db.query<OrderRow>(
      `SELECT id, order_number, order_type, custom_order_type, status, customer_name, guest_count, notes, primary_table_id, version, created_at, updated_at
       FROM orders WHERE deleted_at IS NULL AND (?=1 OR status NOT IN ('COMPLETED','CANCELLED')) ORDER BY updated_at DESC LIMIT 500`,
      [includeClosed ? 1 : 0]
    );
    return Promise.all(rows.map((row) => this.mapOrder(row)));
  }

  async getOrder(id: string) {
    const rows = await this.db.query<OrderRow>(
      "SELECT id, order_number, order_type, custom_order_type, status, customer_name, guest_count, notes, primary_table_id, version, created_at, updated_at FROM orders WHERE id=? AND deleted_at IS NULL",
      [id]
    );
    if (!rows[0]) throw new Error("Order was not found.");
    return this.mapOrder(rows[0]);
  }

  private async mapOrder(row: OrderRow): Promise<OrderRecord> {
    const tableRows = await this.db.query<{ table_id: string }>("SELECT table_id FROM order_tables WHERE order_id=? ORDER BY is_primary DESC, table_id", [row.id]);
    const itemRows = await this.db.query<{
      id: string; product_id: string; name: string; sold_quantity_micro: number; sold_unit: UnitCode; base_quantity_micro: number;
      unit_price_cents: number; discount_cents: number; tax_basis_points: number; note: string | null;
    }>("SELECT oi.id, oi.product_id, p.name, oi.sold_quantity_micro, oi.sold_unit, oi.base_quantity_micro, oi.unit_price_cents, oi.discount_cents, oi.tax_basis_points, oi.note FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=? AND oi.deleted_at IS NULL ORDER BY oi.created_at", [row.id]);
    return {
      id: row.id, orderNumber: row.order_number, orderType: row.order_type, customOrderType: row.custom_order_type, status: row.status,
      customerName: row.customer_name, guestCount: Number(row.guest_count), notes: row.notes, primaryTableId: row.primary_table_id,
      tableIds: tableRows.map((table) => table.table_id), version: Number(row.version), createdAt: row.created_at, updatedAt: row.updated_at,
      lines: itemRows.map((item) => ({ id: item.id, productId: item.product_id, name: item.name, soldQuantityMicro: Number(item.sold_quantity_micro), soldUnit: item.sold_unit, baseQuantityMicro: Number(item.base_quantity_micro), unitPriceCents: Number(item.unit_price_cents), discountCents: Number(item.discount_cents), taxBasisPoints: Number(item.tax_basis_points), note: item.note }))
    };
  }
}
