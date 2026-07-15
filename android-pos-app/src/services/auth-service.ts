import type { LocalDatabase } from "../data/database";
import { createId, nowIso, type LocalUser } from "../domain/models";
import { hashSecret, verifySecret } from "../domain/security";
import { audit } from "./service-helpers";

type UserRow = {
  id: string;
  name: string;
  login: string;
  role_name: LocalUser["role"];
  permissions_json: string;
  secret_hash: string;
};

function toUser(row: UserRow): LocalUser {
  return { id: row.id, name: row.name, login: row.login, role: row.role_name, permissions: JSON.parse(row.permissions_json) as string[] };
}

export class AuthService {
  constructor(private db: LocalDatabase) {}

  async requiresSetup() {
    const rows = await this.db.query<{ count: number }>("SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL");
    return Number(rows[0]?.count ?? 0) === 0;
  }

  async setupOwner(input: { name: string; login: string; secret: string; businessName: string }) {
    if (!(await this.requiresSetup())) throw new Error("Initial setup has already been completed.");
    const id = createId("user");
    const now = nowIso();
    const secretHash = await hashSecret(input.secret);
    await this.db.transaction(async () => {
      await this.db.run(
        "INSERT INTO users(id, role_id, name, login, secret_hash, status, created_at, updated_at) VALUES (?, 'role_owner', ?, ?, ?, 'ACTIVE', ?, ?)",
        [id, input.name.trim(), input.login.trim().toLowerCase(), secretHash, now, now],
        false
      );
      await this.db.run("INSERT INTO settings(key, value_json, updated_at, updated_by) VALUES ('app', ?, ?, ?)", [JSON.stringify({ businessName: input.businessName.trim() }), now, id], false);
      await audit(this.db, { actorId: id, action: "OWNER_SETUP_COMPLETED", entityType: "User", entityId: id });
    });
    return this.login(input.login, input.secret);
  }

  async login(login: string, secret: string) {
    const rows = await this.db.query<UserRow>(
      `SELECT u.id, u.name, u.login, u.secret_hash, r.name AS role_name, r.permissions_json
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.login = ? COLLATE NOCASE AND u.status = 'ACTIVE' AND u.deleted_at IS NULL LIMIT 1`,
      [login.trim()]
    );
    const row = rows[0];
    if (!row || !(await verifySecret(secret, row.secret_hash))) {
      await audit(this.db, { action: "LOGIN_FAILED", entityType: "User", metadata: { login: login.trim().toLowerCase() } });
      throw new Error("The login or PIN is incorrect.");
    }
    await audit(this.db, { actorId: row.id, action: "LOGIN_SUCCEEDED", entityType: "User", entityId: row.id });
    return toUser(row);
  }

  async listUsers() {
    const rows = await this.db.query<UserRow>(
      `SELECT u.id, u.name, u.login, u.secret_hash, r.name AS role_name, r.permissions_json
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.deleted_at IS NULL ORDER BY u.name`
    );
    return rows.map(toUser);
  }

  async createUser(actor: LocalUser, input: { name: string; login: string; secret: string; role: Exclude<LocalUser["role"], "OWNER"> }) {
    if (actor.role !== "OWNER" && actor.role !== "MANAGER") throw new Error("Manager authorization is required.");
    const id = createId("user");
    const now = nowIso();
    await this.db.transaction(async () => {
      await this.db.run(
        "INSERT INTO users(id, role_id, name, login, secret_hash, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)",
        [id, input.role === "MANAGER" ? "role_manager" : "role_cashier", input.name.trim(), input.login.trim().toLowerCase(), await hashSecret(input.secret), now, now],
        false
      );
      await audit(this.db, { actorId: actor.id, action: "USER_CREATED", entityType: "User", entityId: id, metadata: { role: input.role } });
    });
  }
}

