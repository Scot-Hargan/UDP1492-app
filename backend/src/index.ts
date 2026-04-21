import { DurableObject } from "cloudflare:workers";

const DIRECTORY_OBJECT_NAME = "managed-directory";
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
const DEFAULT_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_PRESENCE_TTL_MS = DEFAULT_HEARTBEAT_INTERVAL_MS * 3;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type"
};

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];

interface JsonObject {
  [key: string]: JsonValue;
}

type SessionRole = "operator" | "member";

export interface Env {
  CHANNEL_DO: DurableObjectNamespace<ChannelDOManagedV2>;
  DIRECTORY_DO: DurableObjectNamespace<DirectoryDOManagedV2>;
  MANAGED_HEARTBEAT_INTERVAL_MS?: string;
  MANAGED_SESSION_TTL_MS?: string;
  MANAGED_PRESENCE_TTL_MS?: string;
}

interface SessionRecord {
  sessionId: string;
  userId: string;
  displayName: string;
  expiresAt: string;
  role: SessionRole;
}

interface SlotMembershipRecord {
  sessionId: string;
  slotId: string;
  channelId: string;
}

interface ChannelConfig {
  channelId: string;
  name: string;
  description: string;
  note: string;
  securityMode: "open" | "passcode";
  requiresPasscode: boolean;
  concurrentAccessAllowed: boolean;
}

interface StoredChannelConfig extends ChannelConfig {
  passcodeHash: string;
  passcodeSalt: string;
  hasPasscodeSecret: boolean;
  passcode?: string;
}

interface MembershipResponse {
  channelId: string;
  slotId: string;
  membershipState: string;
  joinedAt?: string;
  leftAt?: string;
}

interface ChannelCountResponse {
  memberCount: number;
}

interface PresenceRegistration {
  endpointId: string;
  kind: string;
  registrationState: string;
  lastValidatedAt: string;
}

interface SessionPermissions {
  canReadAdminSummary: boolean;
  canManageChannels: boolean;
  canManagePasscodes: boolean;
}

interface ChannelAdminSummary {
  memberCount: number;
  onlineMemberCount: number;
  readyEndpointCount: number;
  lastPresenceAt: string;
}

interface PasscodeSecret {
  passcodeHash: string;
  passcodeSalt: string;
}

interface SeedChannelConfig extends ChannelConfig {
  passcode?: string;
}

const DEFAULT_CHANNELS: SeedChannelConfig[] = [
  {
    channelId: "chn_alpha",
    name: "Alpha",
    description: "Primary coordination channel",
    note: "Seeded development channel",
    securityMode: "open",
    requiresPasscode: false,
    concurrentAccessAllowed: true
  },
  {
    channelId: "chn_bravo",
    name: "Bravo",
    description: "Protected development channel",
    note: "Seeded development protected channel",
    securityMode: "passcode",
    requiresPasscode: true,
    concurrentAccessAllowed: true,
    passcode: "alpha-secret"
  }
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveIntegerOrNull(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function booleanFromUnknown(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  }
  return fallback;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeSessionRole(value: unknown): SessionRole {
  return value === "operator" ? "operator" : "member";
}

function buildPermissionsForRole(role: SessionRole): SessionPermissions {
  const canManage = role === "operator";
  return {
    canReadAdminSummary: canManage,
    canManageChannels: canManage,
    canManagePasscodes: canManage
  };
}

function addMs(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

function getHeartbeatIntervalMs(env: Env): number {
  return positiveIntegerOrNull(env.MANAGED_HEARTBEAT_INTERVAL_MS) ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
}

function getSessionTtlMs(env: Env): number {
  return positiveIntegerOrNull(env.MANAGED_SESSION_TTL_MS) ?? DEFAULT_SESSION_TTL_MS;
}

function getPresenceTtlMs(env: Env): number {
  return positiveIntegerOrNull(env.MANAGED_PRESENCE_TTL_MS) ?? (getHeartbeatIntervalMs(env) * 3 || DEFAULT_PRESENCE_TTL_MS);
}

function sanitizeSlotId(value: unknown): string {
  const nextValue = stringOrEmpty(value).trim().toUpperCase();
  return nextValue || "A";
}

function normalizeEndpointKind(value: unknown): string {
  const kind = stringOrEmpty(value).trim().toLowerCase();
  if (!kind) return "unknown";
  if (kind === "local" || kind === "public" || kind === "peer" || kind === "unknown") return kind;
  return kind;
}

function buildSessionId(): string {
  return `ses_${crypto.randomUUID().replace(/-/g, "")}`;
}

function buildUserId(): string {
  return `usr_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function buildEndpointId(slotId: string, kind: string, ip: string, port: number): string {
  const sanitizedIp = ip.replace(/[^a-zA-Z0-9]/g, "_");
  return `end_${slotId}_${kind}_${sanitizedIp}_${port}`;
}

function buildChannelId(): string {
  return `chn_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function sanitizeChannelId(value: unknown): string {
  const channelId = stringOrEmpty(value).trim().toLowerCase();
  if (!channelId) return "";
  if (!/^chn_[a-z0-9_]{3,48}$/.test(channelId)) {
    throw new HttpError("Channel identifiers must start with chn_ and use lowercase letters, numbers, or underscores.", {
      status: 400,
      code: "managed_channel_id_invalid"
    });
  }
  return channelId;
}

function sanitizeChannelName(value: unknown): string {
  const name = stringOrEmpty(value).trim();
  if (!name) {
    throw new HttpError("Channel name is required.", {
      status: 400,
      code: "managed_channel_name_required"
    });
  }
  if (name.length > 80) {
    throw new HttpError("Channel name must be 80 characters or fewer.", {
      status: 400,
      code: "managed_channel_name_invalid"
    });
  }
  return name;
}

function sanitizeShortTextField(value: unknown, field: "description" | "note", maxLength: number): string {
  const text = stringOrEmpty(value).trim();
  if (text.length > maxLength) {
    throw new HttpError(`Channel ${field} must be ${maxLength} characters or fewer.`, {
      status: 400,
      code: `managed_channel_${field}_invalid`
    });
  }
  return text;
}

function sanitizeSecurityMode(value: unknown): "open" | "passcode" {
  return stringOrEmpty(value).trim().toLowerCase() === "passcode" ? "passcode" : "open";
}

function sanitizePasscodeInput(value: unknown): string {
  const passcode = stringOrEmpty(value).trim();
  if (!passcode) return "";
  if (passcode.length < 4 || passcode.length > 128) {
    throw new HttpError("Protected channel passcodes must be between 4 and 128 characters.", {
      status: 400,
      code: "managed_passcode_invalid"
    });
  }
  return passcode;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildPasscodeMaterial(passcode: string, salt: string): Uint8Array {
  return new TextEncoder().encode(`${salt}:${passcode}`);
}

async function hashPasscode(passcode: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buildPasscodeMaterial(passcode, salt));
  return toHex(digest);
}

async function createPasscodeSecret(passcode: string): Promise<PasscodeSecret> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const passcodeSalt = toHex(saltBytes.buffer);
  return {
    passcodeSalt,
    passcodeHash: await hashPasscode(passcode, passcodeSalt)
  };
}

function secureEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function verifyPasscodeSecret(passcode: string, channel: StoredChannelConfig): Promise<boolean> {
  if (!channel.hasPasscodeSecret || !channel.passcodeHash || !channel.passcodeSalt) return false;
  const candidateHash = await hashPasscode(passcode, channel.passcodeSalt);
  return secureEqual(candidateHash, channel.passcodeHash);
}

function parseJsonText(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text) return {};
  const parsed = parseJsonText(text);
  if (!isPlainObject(parsed)) {
    throw new HttpError("Request body must be a JSON object.", {
      status: 400,
      code: "managed_request_invalid"
    });
  }
  return parsed;
}

function jsonResponse(payload: JsonValue, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...CORS_HEADERS
    }
  });
}

function textResponse(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...CORS_HEADERS
    }
  });
}

function emptyResponse(status = 204): Response {
  return new Response("", {
    status,
    headers: CORS_HEADERS
  });
}

class HttpError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      details?: unknown;
    } = {}
  ) {
    super(message);
    this.name = "HttpError";
    this.status = options.status ?? 500;
    this.code = options.code || "managed_api_error";
    this.details = options.details ?? null;
  }
}

function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonResponse(
      {
        code: error.code,
        message: error.message,
        details: error.details ?? undefined
      },
      error.status
    );
  }
  const message = error instanceof Error ? error.message : "Unexpected backend failure.";
  return jsonResponse(
    {
      code: "managed_internal_error",
      message
    },
    500
  );
}

async function fetchStubJson<T>(stub: DurableObjectStub, url: string, init?: RequestInit): Promise<T> {
  const response = await stub.fetch(url, init);
  const text = await response.text();
  const parsed = parseJsonText(text);
  if (!response.ok) {
    const message = isPlainObject(parsed) && typeof parsed.message === "string"
      ? parsed.message
      : `Request failed with ${response.status}`;
    const code = isPlainObject(parsed) && typeof parsed.code === "string"
      ? parsed.code
      : "managed_http_error";
    throw new HttpError(message, {
      status: response.status,
      code,
      details: parsed
    });
  }
  return parsed as T;
}

function normalizeChannelForClient(channel: ChannelConfig, memberCount: number): JsonObject {
  return {
    channelId: channel.channelId,
    name: channel.name,
    description: channel.description,
    note: channel.note,
    securityMode: channel.securityMode,
    requiresPasscode: channel.requiresPasscode,
    concurrentAccessAllowed: channel.concurrentAccessAllowed,
    memberCount
  };
}

export class DirectoryDOManagedV2 extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      await this.initializeSchema();
    });
  }

  getHeartbeatIntervalMs(): number {
    return getHeartbeatIntervalMs(this.env);
  }

  getSessionTtlMs(): number {
    return getSessionTtlMs(this.env);
  }

  async initializeSchema(): Promise<void> {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS channels (
        channel_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        security_mode TEXT NOT NULL DEFAULT 'open',
        requires_passcode INTEGER NOT NULL DEFAULT 0,
        concurrent_access_allowed INTEGER NOT NULL DEFAULT 1,
        passcode_hash TEXT NOT NULL DEFAULT '',
        passcode_salt TEXT NOT NULL DEFAULT '',
        passcode TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS directory_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        client_version TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL DEFAULT 'managed',
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS slot_memberships (
        session_id TEXT NOT NULL,
        slot_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (session_id, slot_id)
      );
    `);

    if (!this.hasTableColumn("sessions", "role")) {
      this.ctx.storage.sql.exec(
        `ALTER TABLE sessions
         ADD COLUMN role TEXT NOT NULL DEFAULT 'member'`
      );
    }

    if (!this.hasTableColumn("channels", "passcode_hash")) {
      this.ctx.storage.sql.exec(
        `ALTER TABLE channels
         ADD COLUMN passcode_hash TEXT NOT NULL DEFAULT ''`
      );
    }

    if (!this.hasTableColumn("channels", "passcode_salt")) {
      this.ctx.storage.sql.exec(
        `ALTER TABLE channels
         ADD COLUMN passcode_salt TEXT NOT NULL DEFAULT ''`
      );
    }

    for (const channel of DEFAULT_CHANNELS) {
      const secret = channel.requiresPasscode && channel.passcode
        ? await createPasscodeSecret(channel.passcode)
        : { passcodeHash: "", passcodeSalt: "" };
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO channels (
          channel_id,
          name,
          description,
          note,
          security_mode,
          requires_passcode,
          concurrent_access_allowed,
          passcode_hash,
          passcode_salt,
          passcode
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        channel.channelId,
        channel.name,
        channel.description,
        channel.note,
        channel.securityMode,
        channel.requiresPasscode ? 1 : 0,
        channel.concurrentAccessAllowed ? 1 : 0,
        secret.passcodeHash,
        secret.passcodeSalt,
        ""
      );
    }

    await this.backfillLegacyPasscodes();
  }

  hasTableColumn(tableName: string, columnName: string): boolean {
    const rows = this.ctx.storage.sql
      .exec<{ name: string }>(`PRAGMA table_info(${tableName})`)
      .toArray();
    return rows.some((row) => row.name === columnName);
  }

  getDirectoryStateValue(key: string): string {
    const rows = this.ctx.storage.sql
      .exec<{ value: string }>(
        `SELECT value
         FROM directory_state
         WHERE key = ?`,
        key
      )
      .toArray();
    return rows[0]?.value || "";
  }

  setDirectoryStateValue(key: string, value: string): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO directory_state (key, value)
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value`,
      key,
      value
    );
  }

  cleanupExpiredSessions(now = nowIso()): void {
    this.ctx.storage.sql.exec(
      "DELETE FROM sessions WHERE expires_at < ?",
      now
    );
    this.ctx.storage.sql.exec(
      `DELETE FROM slot_memberships
       WHERE session_id NOT IN (
         SELECT session_id
         FROM sessions
       )`
    );
  }

  getSessionRow(sessionId: string): SessionRecord | null {
    const rows = this.ctx.storage.sql
      .exec<{
        session_id: string;
        user_id: string;
        display_name: string;
        expires_at: string;
        role: string;
      }>(
        `SELECT session_id, user_id, display_name, expires_at, role
         FROM sessions
         WHERE session_id = ?`,
        sessionId
      )
      .toArray();
    const row = rows[0];
    if (!row) return null;
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      displayName: row.display_name,
      expiresAt: row.expires_at,
      role: normalizeSessionRole(row.role)
    };
  }

  async backfillLegacyPasscodes(): Promise<void> {
    const rows = this.ctx.storage.sql
      .exec<{
        channel_id: string;
        passcode: string;
        passcode_hash: string;
        passcode_salt: string;
        requires_passcode: number;
      }>(
        `SELECT channel_id, passcode, passcode_hash, passcode_salt, requires_passcode
         FROM channels`
      )
      .toArray();
    for (const row of rows) {
      const legacyPasscode = stringOrEmpty(row.passcode);
      const hasHash = !!stringOrEmpty(row.passcode_hash) && !!stringOrEmpty(row.passcode_salt);
      if (!row.requires_passcode || !legacyPasscode || hasHash) {
        if (legacyPasscode && hasHash) {
          this.ctx.storage.sql.exec(
            `UPDATE channels
             SET passcode = ''
             WHERE channel_id = ?`,
            row.channel_id
          );
        }
        continue;
      }
      const secret = await createPasscodeSecret(legacyPasscode);
      this.ctx.storage.sql.exec(
        `UPDATE channels
         SET passcode_hash = ?, passcode_salt = ?, passcode = ''
         WHERE channel_id = ?`,
        secret.passcodeHash,
        secret.passcodeSalt,
        row.channel_id
      );
    }
  }

  getChannelRow(channelId: string): StoredChannelConfig | null {
    const rows = this.ctx.storage.sql
      .exec<{
        channel_id: string;
        name: string;
        description: string;
        note: string;
        security_mode: string;
        requires_passcode: number;
        concurrent_access_allowed: number;
        passcode_hash: string;
        passcode_salt: string;
        passcode: string;
      }>(
        `SELECT channel_id, name, description, note, security_mode, requires_passcode, concurrent_access_allowed, passcode_hash, passcode_salt, passcode
         FROM channels
         WHERE channel_id = ?`,
        channelId
      )
      .toArray();
    const row = rows[0];
    if (!row) return null;
    return {
      channelId: row.channel_id,
      name: row.name,
      description: row.description,
      note: row.note,
      securityMode: row.security_mode === "passcode" ? "passcode" : "open",
      requiresPasscode: !!row.requires_passcode,
      concurrentAccessAllowed: !!row.concurrent_access_allowed,
      passcodeHash: row.passcode_hash || "",
      passcodeSalt: row.passcode_salt || "",
      hasPasscodeSecret: !!row.passcode_hash && !!row.passcode_salt,
      passcode: row.passcode || undefined
    };
  }

  listChannelRows(): StoredChannelConfig[] {
    const rows = this.ctx.storage.sql
      .exec<{
        channel_id: string;
        name: string;
        description: string;
        note: string;
        security_mode: string;
        requires_passcode: number;
        concurrent_access_allowed: number;
        passcode_hash: string;
        passcode_salt: string;
        passcode: string;
      }>(
        `SELECT channel_id, name, description, note, security_mode, requires_passcode, concurrent_access_allowed, passcode_hash, passcode_salt, passcode
         FROM channels
         ORDER BY name ASC`
      )
      .toArray();
    return rows.map((row) => ({
      channelId: row.channel_id,
      name: row.name,
      description: row.description,
      note: row.note,
      securityMode: row.security_mode === "passcode" ? "passcode" : "open",
      requiresPasscode: !!row.requires_passcode,
      concurrentAccessAllowed: !!row.concurrent_access_allowed,
      passcodeHash: row.passcode_hash || "",
      passcodeSalt: row.passcode_salt || "",
      hasPasscodeSecret: !!row.passcode_hash && !!row.passcode_salt,
      passcode: row.passcode || undefined
    }));
  }

  hasActiveSessionForUserId(userId: string, now = nowIso()): boolean {
    if (!userId) return false;
    const rows = this.ctx.storage.sql
      .exec<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM sessions
         WHERE user_id = ?
           AND expires_at >= ?`,
        userId,
        now
      )
      .toArray();
    return Number(rows[0]?.count) > 0;
  }

  resolveSessionRole(userId: string, now = nowIso()): SessionRole {
    const operatorUserId = this.getDirectoryStateValue("operator_user_id");
    if (!operatorUserId) {
      this.setDirectoryStateValue("operator_user_id", userId);
      return "operator";
    }
    if (operatorUserId === userId) {
      return "operator";
    }
    if (!this.hasActiveSessionForUserId(operatorUserId, now)) {
      this.setDirectoryStateValue("operator_user_id", userId);
      return "operator";
    }
    return "member";
  }

  validateSession(sessionId: string): SessionRecord {
    const now = nowIso();
    this.cleanupExpiredSessions(now);
    if (!sessionId) {
      throw new HttpError("A valid session is required.", {
        status: 401,
        code: "managed_session_required"
      });
    }
    const session = this.getSessionRow(sessionId);
    if (!session) {
      throw new HttpError("Managed session is missing or expired.", {
        status: 401,
        code: "managed_session_expired"
      });
    }
    const nextExpiresAt = addMs(now, this.getSessionTtlMs());
    this.ctx.storage.sql.exec(
      `UPDATE sessions
       SET last_seen_at = ?, expires_at = ?
       WHERE session_id = ?`,
      now,
      nextExpiresAt,
      sessionId
    );
    return {
      ...session,
      expiresAt: nextExpiresAt
    };
  }

  requireOperatorSession(sessionId: string): SessionRecord {
    const session = this.validateSession(sessionId);
    if (session.role !== "operator") {
      throw new HttpError("This managed session does not have permission to perform admin operations.", {
        status: 403,
        code: "managed_admin_forbidden",
        details: {
          requiredRole: "operator",
          actualRole: session.role
        }
      });
    }
    return session;
  }

  getChannelCount(): number {
    const rows = this.ctx.storage.sql
      .exec<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM channels`
      )
      .toArray();
    return Number(rows[0]?.count) || 0;
  }

  async getChannelMemberCount(channelId: string): Promise<number> {
    const id = this.env.CHANNEL_DO.idFromName(channelId);
    const stub = this.env.CHANNEL_DO.get(id);
    try {
      const result = await fetchStubJson<ChannelCountResponse>(
        stub,
        "https://channel/internal/member-count"
      );
      return Number(result.memberCount) || 0;
    } catch {
      return 0;
    }
  }

  parseAdminChannelInput(body: Record<string, unknown>, existingChannel?: StoredChannelConfig | null): {
    channelId: string;
    name: string;
    description: string;
    note: string;
    securityMode: "open" | "passcode";
    requiresPasscode: boolean;
    concurrentAccessAllowed: boolean;
    passcode: string;
  } {
    const channelId = sanitizeChannelId(body.channelId) || existingChannel?.channelId || buildChannelId();
    const securityMode = sanitizeSecurityMode(body.securityMode ?? existingChannel?.securityMode);
    const requiresPasscode = securityMode === "passcode";
    const passcode = sanitizePasscodeInput(body.passcode);
    return {
      channelId,
      name: sanitizeChannelName(body.name ?? existingChannel?.name),
      description: sanitizeShortTextField(body.description ?? existingChannel?.description, "description", 280),
      note: sanitizeShortTextField(body.note ?? existingChannel?.note, "note", 280),
      securityMode,
      requiresPasscode,
      concurrentAccessAllowed: booleanFromUnknown(
        body.concurrentAccessAllowed,
        existingChannel?.concurrentAccessAllowed ?? true
      ),
      passcode
    };
  }

  async upsertChannelRecord(input: {
    channelId: string;
    name: string;
    description: string;
    note: string;
    securityMode: "open" | "passcode";
    requiresPasscode: boolean;
    concurrentAccessAllowed: boolean;
    passcode: string;
  }, existingChannel?: StoredChannelConfig | null): Promise<StoredChannelConfig> {
    const nextChannel = existingChannel || null;
    let passcodeHash = nextChannel?.passcodeHash || "";
    let passcodeSalt = nextChannel?.passcodeSalt || "";

    if (input.requiresPasscode) {
      if (input.passcode) {
        const secret = await createPasscodeSecret(input.passcode);
        passcodeHash = secret.passcodeHash;
        passcodeSalt = secret.passcodeSalt;
      } else if (!passcodeHash || !passcodeSalt) {
        throw new HttpError("Protected channels require a passcode when first created.", {
          status: 400,
          code: "managed_passcode_required"
        });
      }
    } else {
      passcodeHash = "";
      passcodeSalt = "";
    }

    this.ctx.storage.sql.exec(
      `INSERT INTO channels (
        channel_id,
        name,
        description,
        note,
        security_mode,
        requires_passcode,
        concurrent_access_allowed,
        passcode_hash,
        passcode_salt,
        passcode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')
      ON CONFLICT(channel_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        note = excluded.note,
        security_mode = excluded.security_mode,
        requires_passcode = excluded.requires_passcode,
        concurrent_access_allowed = excluded.concurrent_access_allowed,
        passcode_hash = excluded.passcode_hash,
        passcode_salt = excluded.passcode_salt,
        passcode = ''`,
      input.channelId,
      input.name,
      input.description,
      input.note,
      input.securityMode,
      input.requiresPasscode ? 1 : 0,
      input.concurrentAccessAllowed ? 1 : 0,
      passcodeHash,
      passcodeSalt
    );
    const stored = this.getChannelRow(input.channelId);
    if (!stored) {
      throw new HttpError("Managed channel could not be persisted.", {
        status: 500,
        code: "managed_channel_persist_failed"
      });
    }
    return stored;
  }

  getSlotMembership(sessionId: string, slotId: string): SlotMembershipRecord | null {
    const rows = this.ctx.storage.sql
      .exec<{
        session_id: string;
        slot_id: string;
        channel_id: string;
      }>(
        `SELECT session_id, slot_id, channel_id
         FROM slot_memberships
         WHERE session_id = ? AND slot_id = ?`,
        sessionId,
        slotId
      )
      .toArray();
    const row = rows[0];
    if (!row) return null;
    return {
      sessionId: row.session_id,
      slotId: row.slot_id,
      channelId: row.channel_id
    };
  }

  setSlotMembership(sessionId: string, slotId: string, channelId: string): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO slot_memberships (
        session_id,
        slot_id,
        channel_id,
        updated_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(session_id, slot_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        updated_at = excluded.updated_at`,
      sessionId,
      slotId,
      channelId,
      nowIso()
    );
  }

  clearSlotMembership(sessionId: string, slotId: string, channelId?: string): void {
    if (channelId) {
      this.ctx.storage.sql.exec(
        `DELETE FROM slot_memberships
         WHERE session_id = ? AND slot_id = ? AND channel_id = ?`,
        sessionId,
        slotId,
        channelId
      );
      return;
    }
    this.ctx.storage.sql.exec(
      `DELETE FROM slot_memberships
       WHERE session_id = ? AND slot_id = ?`,
      sessionId,
      slotId
    );
  }

  isSessionJoinedToChannel(sessionId: string, channelId: string): boolean {
    const rows = this.ctx.storage.sql
      .exec<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM slot_memberships
         WHERE session_id = ? AND channel_id = ?`,
        sessionId,
        channelId
      )
      .toArray();
    return Number(rows[0]?.count) > 0;
  }

  async handleOpenSession(request: Request): Promise<Response> {
    const body = await readJsonBody(request);
    const displayName = stringOrEmpty(body.displayName).trim();
    if (!displayName) {
      throw new HttpError("Display name is required before opening a managed session.", {
        status: 400,
        code: "managed_display_name_required"
      });
    }

    const now = nowIso();
    this.cleanupExpiredSessions(now);

    const resumeSessionId = stringOrEmpty(body.resumeSessionId).trim();
    const requestedUserId = stringOrEmpty(body.requestedUserId).trim();
    const clientVersion = stringOrEmpty(body.clientVersion).trim();
    const mode = stringOrEmpty(body.mode).trim() || "managed";
    const nextExpiresAt = addMs(now, this.getSessionTtlMs());

    if (resumeSessionId) {
      const resumed = this.getSessionRow(resumeSessionId);
      if (resumed) {
        this.ctx.storage.sql.exec(
          `UPDATE sessions
           SET display_name = ?, client_version = ?, mode = ?, last_seen_at = ?, expires_at = ?
           WHERE session_id = ?`,
          displayName,
          clientVersion,
          mode,
          now,
          nextExpiresAt,
          resumeSessionId
        );
        return jsonResponse({
          identity: {
            userId: resumed.userId,
            sessionId: resumeSessionId,
            displayName,
            role: resumed.role
          },
          session: {
            openedAt: now,
            expiresAt: nextExpiresAt,
            heartbeatIntervalMs: this.getHeartbeatIntervalMs(),
            permissions: buildPermissionsForRole(resumed.role)
          }
        });
      }
    }

    const sessionId = buildSessionId();
    const userId = requestedUserId || buildUserId();
    const role = this.resolveSessionRole(userId, now);
    this.ctx.storage.sql.exec(
      `INSERT INTO sessions (
        session_id,
        user_id,
        display_name,
        client_version,
        mode,
        role,
        created_at,
        expires_at,
        last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      sessionId,
      userId,
      displayName,
      clientVersion,
      mode,
      role,
      now,
      nextExpiresAt,
      now
    );

    return jsonResponse({
      identity: {
        userId,
        sessionId,
        displayName,
        role
      },
      session: {
        openedAt: now,
        expiresAt: nextExpiresAt,
        heartbeatIntervalMs: this.getHeartbeatIntervalMs(),
        permissions: buildPermissionsForRole(role)
      }
    });
  }

  async handleListChannels(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") || "";
    this.validateSession(sessionId);
    const channels = this.listChannelRows();
    const withCounts = await Promise.all(channels.map(async (channel) => {
      const id = this.env.CHANNEL_DO.idFromName(channel.channelId);
      const stub = this.env.CHANNEL_DO.get(id);
      try {
        const result = await fetchStubJson<ChannelCountResponse>(
          stub,
          "https://channel/internal/member-count"
        );
        return normalizeChannelForClient(channel, Number(result.memberCount) || 0);
      } catch {
        return normalizeChannelForClient(channel, 0);
      }
    }));
    return jsonResponse({
      channels: withCounts,
      syncedAt: nowIso()
    });
  }

  async handleGetSession(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") || "";
    const session = this.validateSession(sessionId);
    return jsonResponse({
      session: {
        ...session,
        permissions: buildPermissionsForRole(session.role)
      }
    });
  }

  async handleGetAdminSummary(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") || "";
    const viewer = this.requireOperatorSession(sessionId);
    const observedAt = nowIso();
    this.cleanupExpiredSessions(observedAt);

    const channels = this.listChannelRows();
    const channelSummaries = await Promise.all(channels.map(async (channel) => {
      const id = this.env.CHANNEL_DO.idFromName(channel.channelId);
      const stub = this.env.CHANNEL_DO.get(id);
      try {
        const summary = await fetchStubJson<ChannelAdminSummary>(
          stub,
          "https://channel/internal/admin-summary"
        );
        return {
          channelId: channel.channelId,
          memberCount: Number(summary.memberCount) || 0,
          onlineMemberCount: Number(summary.onlineMemberCount) || 0,
          readyEndpointCount: Number(summary.readyEndpointCount) || 0,
          lastPresenceAt: stringOrEmpty(summary.lastPresenceAt)
        };
      } catch {
        return {
          channelId: channel.channelId,
          memberCount: 0,
          onlineMemberCount: 0,
          readyEndpointCount: 0,
          lastPresenceAt: ""
        };
      }
    }));

    const sessionStats = this.ctx.storage.sql
      .exec<{
        active_session_count: number;
        active_operator_session_count: number;
        active_member_session_count: number;
      }>(
        `SELECT
           COUNT(*) AS active_session_count,
           SUM(CASE WHEN role = 'operator' THEN 1 ELSE 0 END) AS active_operator_session_count,
           SUM(CASE WHEN role = 'member' THEN 1 ELSE 0 END) AS active_member_session_count
         FROM sessions
         WHERE expires_at >= ?`,
        observedAt
      )
      .toArray()[0];

    const membershipStats = this.ctx.storage.sql
      .exec<{
        joined_slot_count: number;
      }>(
        `SELECT COUNT(*) AS joined_slot_count
         FROM slot_memberships`
      )
      .toArray()[0];

    const summaryByChannelId = new Map(channelSummaries.map((summary) => [summary.channelId, summary]));
    const activeMemberCount = channelSummaries.reduce((sum, channel) => sum + channel.memberCount, 0);
    const onlineMemberCount = channelSummaries.reduce((sum, channel) => sum + channel.onlineMemberCount, 0);
    const readyEndpointCount = channelSummaries.reduce((sum, channel) => sum + channel.readyEndpointCount, 0);
    const activeChannelCount = channelSummaries.filter((channel) => channel.memberCount > 0).length;

    return jsonResponse({
      viewer: {
        sessionId: viewer.sessionId,
        userId: viewer.userId,
        displayName: viewer.displayName,
        role: viewer.role
      },
      permissions: buildPermissionsForRole(viewer.role),
      directory: {
        channelCount: channels.length,
        protectedChannelCount: channels.filter((channel) => channel.requiresPasscode).length,
        openChannelCount: channels.filter((channel) => !channel.requiresPasscode).length,
        activeSessionCount: Number(sessionStats?.active_session_count) || 0,
        activeOperatorSessionCount: Number(sessionStats?.active_operator_session_count) || 0,
        activeMemberSessionCount: Number(sessionStats?.active_member_session_count) || 0,
        joinedSlotCount: Number(membershipStats?.joined_slot_count) || 0,
        activeChannelCount,
        activeMemberCount,
        onlineMemberCount,
        readyEndpointCount,
        sessionTtlMs: this.getSessionTtlMs(),
        presenceTtlMs: getPresenceTtlMs(this.env),
        observedAt
      },
      channels: channels.map((channel) => {
        const summary = summaryByChannelId.get(channel.channelId);
        return {
          ...normalizeChannelForClient(channel, summary?.memberCount || 0),
          onlineMemberCount: summary?.onlineMemberCount || 0,
          readyEndpointCount: summary?.readyEndpointCount || 0,
          lastPresenceAt: summary?.lastPresenceAt || ""
        };
      })
    });
  }

  async handleCreateAdminChannel(request: Request): Promise<Response> {
    const body = await readJsonBody(request);
    const sessionId = stringOrEmpty(body.sessionId).trim();
    this.requireOperatorSession(sessionId);

    const parsed = this.parseAdminChannelInput(body, null);
    if (this.getChannelRow(parsed.channelId)) {
      throw new HttpError("Managed channel identifier already exists.", {
        status: 409,
        code: "managed_channel_conflict"
      });
    }

    const stored = await this.upsertChannelRecord(parsed);
    return jsonResponse({
      channel: normalizeChannelForClient(stored, await this.getChannelMemberCount(stored.channelId))
    }, 201);
  }

  async handleUpdateAdminChannel(request: Request): Promise<Response> {
    const body = await readJsonBody(request);
    const sessionId = stringOrEmpty(body.sessionId).trim();
    const channelId = sanitizeChannelId(body.channelId);
    this.requireOperatorSession(sessionId);
    const existing = this.getChannelRow(channelId);
    if (!existing) {
      throw new HttpError("Managed channel was not found.", {
        status: 404,
        code: "managed_channel_not_found"
      });
    }

    const parsed = this.parseAdminChannelInput(body, existing);
    if (parsed.channelId !== existing.channelId) {
      throw new HttpError("Managed channel identifiers cannot be changed after creation.", {
        status: 400,
        code: "managed_channel_id_immutable"
      });
    }

    const stored = await this.upsertChannelRecord(parsed, existing);
    return jsonResponse({
      channel: normalizeChannelForClient(stored, await this.getChannelMemberCount(stored.channelId))
    });
  }

  async handleDeleteAdminChannel(request: Request): Promise<Response> {
    const body = await readJsonBody(request);
    const sessionId = stringOrEmpty(body.sessionId).trim();
    const channelId = sanitizeChannelId(body.channelId);
    this.requireOperatorSession(sessionId);
    const existing = this.getChannelRow(channelId);
    if (!existing) {
      throw new HttpError("Managed channel was not found.", {
        status: 404,
        code: "managed_channel_not_found"
      });
    }
    if (this.getChannelCount() <= 1) {
      throw new HttpError("At least one managed channel must remain in the directory.", {
        status: 409,
        code: "managed_channel_delete_last_forbidden"
      });
    }
    const memberCount = await this.getChannelMemberCount(channelId);
    if (memberCount > 0) {
      throw new HttpError("Channels with active members cannot be deleted.", {
        status: 409,
        code: "managed_channel_delete_active"
      });
    }
    this.ctx.storage.sql.exec(
      `DELETE FROM slot_memberships
       WHERE channel_id = ?`,
      channelId
    );
    this.ctx.storage.sql.exec(
      `DELETE FROM channels
       WHERE channel_id = ?`,
      channelId
    );
    return jsonResponse({
      deleted: true,
      channelId
    });
  }

  async handleGetChannelConfig(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const channelId = url.searchParams.get("channelId") || "";
    const channel = this.getChannelRow(channelId);
    if (!channel) {
      throw new HttpError("Managed channel was not found.", {
        status: 404,
        code: "managed_channel_not_found"
      });
    }
    return jsonResponse({
      channel
    });
  }

  async handleGetSlotMembership(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") || "";
    const slotId = sanitizeSlotId(url.searchParams.get("slotId"));
    this.validateSession(sessionId);
    return jsonResponse({
      membership: this.getSlotMembership(sessionId, slotId)
    });
  }

  async handleSetSlotMembership(request: Request): Promise<Response> {
    const body = await readJsonBody(request);
    const sessionId = stringOrEmpty(body.sessionId).trim();
    const slotId = sanitizeSlotId(body.slotId);
    const channelId = stringOrEmpty(body.channelId).trim();
    this.validateSession(sessionId);
    if (!channelId) {
      throw new HttpError("Slot membership requires a channel identifier.", {
        status: 400,
        code: "managed_membership_invalid"
      });
    }
    this.setSlotMembership(sessionId, slotId, channelId);
    return jsonResponse({
      membership: {
        sessionId,
        slotId,
        channelId
      }
    });
  }

  async handleClearSlotMembership(request: Request): Promise<Response> {
    const body = await readJsonBody(request);
    const sessionId = stringOrEmpty(body.sessionId).trim();
    const slotId = sanitizeSlotId(body.slotId);
    const channelId = stringOrEmpty(body.channelId).trim();
    // Internal leave cleanup must stay idempotent even if the session already expired.
    this.clearSlotMembership(sessionId, slotId, channelId || undefined);
    return jsonResponse({
      cleared: true
    });
  }

  async handleAssertChannelMembership(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") || "";
    const channelId = url.searchParams.get("channelId") || "";
    this.validateSession(sessionId);
    return jsonResponse({
      joined: !!channelId && this.isSessionJoinedToChannel(sessionId, channelId)
    });
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") return emptyResponse();
      if (request.method === "POST" && url.pathname === "/internal/session/open") {
        return await this.handleOpenSession(request);
      }
      if (request.method === "GET" && url.pathname === "/internal/channels") {
        return await this.handleListChannels(request);
      }
      if (request.method === "GET" && url.pathname === "/internal/session") {
        return await this.handleGetSession(request);
      }
      if (request.method === "GET" && url.pathname === "/internal/admin-summary") {
        return await this.handleGetAdminSummary(request);
      }
      if (request.method === "POST" && url.pathname === "/internal/admin/channels/create") {
        return await this.handleCreateAdminChannel(request);
      }
      if (request.method === "POST" && url.pathname === "/internal/admin/channels/update") {
        return await this.handleUpdateAdminChannel(request);
      }
      if (request.method === "POST" && url.pathname === "/internal/admin/channels/delete") {
        return await this.handleDeleteAdminChannel(request);
      }
      if (request.method === "GET" && url.pathname === "/internal/channel-config") {
        return await this.handleGetChannelConfig(request);
      }
      if (request.method === "GET" && url.pathname === "/internal/slot-membership") {
        return await this.handleGetSlotMembership(request);
      }
      if (request.method === "POST" && url.pathname === "/internal/slot-membership/set") {
        return await this.handleSetSlotMembership(request);
      }
      if (request.method === "POST" && url.pathname === "/internal/slot-membership/clear") {
        return await this.handleClearSlotMembership(request);
      }
      if (request.method === "GET" && url.pathname === "/internal/channel-membership") {
        return await this.handleAssertChannelMembership(request);
      }
      if (request.method === "GET" && url.pathname === "/internal/health") {
        return jsonResponse({ status: "ok", object: "directory" });
      }
      return jsonResponse(
        {
          code: "managed_not_found",
          message: "Directory route not found."
        },
        404
      );
    } catch (error) {
      return errorResponse(error);
    }
  }
}

// Keep the original exported class name alive so Cloudflare can continue to
// understand the historical migration graph, even though new bindings use V2.
export class DirectoryDO extends DirectoryDOManagedV2 {}

export class ChannelDOManagedV2 extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.initializeSchema();
    });
  }

  getHeartbeatIntervalMs(): number {
    return getHeartbeatIntervalMs(this.env);
  }

  getPresenceTtlMs(): number {
    return getPresenceTtlMs(this.env);
  }

  initializeSchema(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS memberships (
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        slot_id TEXT NOT NULL,
        membership_state TEXT NOT NULL,
        online_state TEXT NOT NULL,
        joined_at TEXT NOT NULL,
        left_at TEXT,
        last_seen_at TEXT NOT NULL,
        PRIMARY KEY (session_id, slot_id)
      );

      CREATE TABLE IF NOT EXISTS endpoints (
        session_id TEXT NOT NULL,
        slot_id TEXT NOT NULL,
        endpoint_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        ip TEXT NOT NULL,
        port INTEGER NOT NULL,
        registration_state TEXT NOT NULL,
        last_validated_at TEXT NOT NULL,
        PRIMARY KEY (session_id, slot_id, endpoint_id)
      );
    `);
  }

  cleanupStaleState(now = nowIso()): void {
    const cutoff = addMs(now, -this.getPresenceTtlMs());
    this.ctx.storage.sql.exec(
      `UPDATE memberships
       SET membership_state = 'none',
           online_state = 'offline',
           left_at = CASE WHEN left_at IS NULL OR left_at = '' THEN last_seen_at ELSE left_at END
       WHERE membership_state = 'joined'
         AND last_seen_at < ?`,
      cutoff
    );
    this.ctx.storage.sql.exec(
      `DELETE FROM endpoints
       WHERE NOT EXISTS (
         SELECT 1
         FROM memberships
         WHERE memberships.session_id = endpoints.session_id
           AND memberships.slot_id = endpoints.slot_id
           AND memberships.membership_state = 'joined'
           AND memberships.last_seen_at >= ?
         )`,
      cutoff
    );
    this.ctx.storage.sql.exec(
      `DELETE FROM memberships
       WHERE membership_state = 'none'
         AND last_seen_at < ?`,
      cutoff
    );
  }

  getExistingMembership(sessionId: string, slotId: string): { joinedAt: string } | null {
    const rows = this.ctx.storage.sql
      .exec<{ joined_at: string }>(
        `SELECT joined_at
         FROM memberships
         WHERE session_id = ? AND slot_id = ?
           AND membership_state = 'joined'
           AND last_seen_at >= ?`,
        sessionId,
        slotId,
        addMs(nowIso(), -this.getPresenceTtlMs())
      )
      .toArray();
    return rows[0] ? { joinedAt: rows[0].joined_at } : null;
  }

  requireJoinedMembership(sessionId: string, slotId?: string): { joinedAt: string } {
    const cutoff = addMs(nowIso(), -this.getPresenceTtlMs());
    const rows = this.ctx.storage.sql
      .exec<{ joined_at: string }>(
        `SELECT joined_at
         FROM memberships
         WHERE session_id = ?
           ${slotId ? "AND slot_id = ?" : ""}
           AND membership_state = 'joined'
           AND last_seen_at >= ?`,
        ...(slotId ? [sessionId, slotId, cutoff] : [sessionId, cutoff])
      )
      .toArray();
    if (!rows[0]) {
      throw new HttpError("Managed channel membership is no longer active.", {
        status: 409,
        code: "managed_membership_required"
      });
    }
    return {
      joinedAt: rows[0].joined_at
    };
  }

  async handleMemberCount(): Promise<Response> {
    const now = nowIso();
    this.cleanupStaleState(now);
    const cutoff = addMs(now, -this.getPresenceTtlMs());
    const rows = this.ctx.storage.sql
      .exec<{ count: number }>(
        `SELECT COUNT(DISTINCT session_id) AS count
         FROM memberships
         WHERE membership_state = 'joined'
           AND last_seen_at >= ?`,
        cutoff
      )
      .toArray();
    return jsonResponse({
      memberCount: Number(rows[0]?.count) || 0
    });
  }

  async handleAdminSummary(): Promise<Response> {
    const now = nowIso();
    this.cleanupStaleState(now);
    const cutoff = addMs(now, -this.getPresenceTtlMs());
    const memberStats = this.ctx.storage.sql
      .exec<{
        member_count: number;
        online_member_count: number;
        last_presence_at: string | null;
      }>(
        `SELECT
           COUNT(DISTINCT session_id) AS member_count,
           COUNT(DISTINCT CASE WHEN online_state = 'online' THEN session_id END) AS online_member_count,
           MAX(last_seen_at) AS last_presence_at
         FROM memberships
         WHERE membership_state = 'joined'
           AND last_seen_at >= ?`,
        cutoff
      )
      .toArray()[0];
    const endpointStats = this.ctx.storage.sql
      .exec<{ ready_endpoint_count: number }>(
        `SELECT COUNT(*) AS ready_endpoint_count
         FROM endpoints`
      )
      .toArray()[0];
    return jsonResponse({
      memberCount: Number(memberStats?.member_count) || 0,
      onlineMemberCount: Number(memberStats?.online_member_count) || 0,
      readyEndpointCount: Number(endpointStats?.ready_endpoint_count) || 0,
      lastPresenceAt: memberStats?.last_presence_at || ""
    });
  }

  async handleJoin(request: Request): Promise<Response> {
    const body = await readJsonBody(request);
    const channelId = stringOrEmpty(body.channelId).trim();
    const sessionId = stringOrEmpty(body.sessionId).trim();
    const userId = stringOrEmpty(body.userId).trim();
    const displayName = stringOrEmpty(body.displayName).trim() || userId || sessionId || "Unknown peer";
    const slotId = sanitizeSlotId(body.slotId);
    if (!channelId || !sessionId || !userId) {
      throw new HttpError("Join requests require channel, session, and user identity.", {
        status: 400,
        code: "managed_join_invalid"
      });
    }
    const now = nowIso();
    const existing = this.getExistingMembership(sessionId, slotId);
    const joinedAt = existing?.joinedAt || now;
    this.ctx.storage.sql.exec(
      `INSERT INTO memberships (
        session_id,
        user_id,
        display_name,
        slot_id,
        membership_state,
        online_state,
        joined_at,
        left_at,
        last_seen_at
      ) VALUES (?, ?, ?, ?, 'joined', 'offline', ?, '', ?)
      ON CONFLICT(session_id, slot_id) DO UPDATE SET
        user_id = excluded.user_id,
        display_name = excluded.display_name,
        membership_state = 'joined',
        online_state = 'offline',
        joined_at = ?,
        left_at = '',
        last_seen_at = excluded.last_seen_at`,
      sessionId,
      userId,
      displayName,
      slotId,
      joinedAt,
      now,
      joinedAt
    );
    this.ctx.storage.sql.exec(
      `DELETE FROM endpoints
       WHERE session_id = ? AND slot_id = ?`,
      sessionId,
      slotId
    );
    return jsonResponse({
      membership: {
        channelId,
        slotId,
        membershipState: "joined",
        joinedAt
      }
    });
  }

  async handlePresence(request: Request): Promise<Response> {
    const body = await readJsonBody(request);
    const channelId = stringOrEmpty(body.channelId).trim();
    const sessionId = stringOrEmpty(body.sessionId).trim();
    const userId = stringOrEmpty(body.userId).trim();
    const displayName = stringOrEmpty(body.displayName).trim() || userId || sessionId || "Unknown peer";
    const slotId = sanitizeSlotId(body.slotId);
    const onlineState = stringOrEmpty(body.onlineState).trim() || "online";
    if (!channelId || !sessionId || !userId) {
      throw new HttpError("Presence updates require channel, session, and user identity.", {
        status: 400,
        code: "managed_presence_invalid"
      });
    }

    const now = nowIso();
    const joinedAt = this.requireJoinedMembership(sessionId, slotId).joinedAt;
    this.ctx.storage.sql.exec(
      `INSERT INTO memberships (
        session_id,
        user_id,
        display_name,
        slot_id,
        membership_state,
        online_state,
        joined_at,
        left_at,
        last_seen_at
      ) VALUES (?, ?, ?, ?, 'joined', ?, ?, '', ?)
      ON CONFLICT(session_id, slot_id) DO UPDATE SET
        user_id = excluded.user_id,
        display_name = excluded.display_name,
        membership_state = 'joined',
        online_state = excluded.online_state,
        joined_at = ?,
        left_at = '',
        last_seen_at = excluded.last_seen_at`,
      sessionId,
      userId,
      displayName,
      slotId,
      onlineState,
      joinedAt,
      now,
      joinedAt
    );

    this.ctx.storage.sql.exec(
      `DELETE FROM endpoints
       WHERE session_id = ? AND slot_id = ?`,
      sessionId,
      slotId
    );

    const registrations: PresenceRegistration[] = [];
    const endpoints = Array.isArray(body.endpoints) ? body.endpoints : [];
    for (const endpoint of endpoints) {
      if (!isPlainObject(endpoint)) continue;
      const ip = stringOrEmpty(endpoint.ip).trim();
      const port = numberOrNull(endpoint.port);
      if (!ip || port == null || port <= 0) continue;
      const kind = normalizeEndpointKind(endpoint.kind);
      const endpointId = stringOrEmpty(endpoint.endpointId).trim() || buildEndpointId(slotId, kind, ip, port);
      this.ctx.storage.sql.exec(
        `INSERT INTO endpoints (
          session_id,
          slot_id,
          endpoint_id,
          kind,
          ip,
          port,
          registration_state,
          last_validated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'ready', ?)`,
        sessionId,
        slotId,
        endpointId,
        kind,
        ip,
        port,
        now
      );
      registrations.push({
        endpointId,
        kind,
        registrationState: "ready",
        lastValidatedAt: now
      });
    }

    this.cleanupStaleState(now);
    return jsonResponse({
      presence: {
        channelId,
        sessionId,
        onlineState,
        lastSeenAt: now
      },
      registrations,
      nextHeartbeatAt: addMs(now, this.getHeartbeatIntervalMs())
    });
  }

  async handlePeers(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const channelId = url.searchParams.get("channelId") || "";
    const sessionId = url.searchParams.get("sessionId") || "";
    if (!channelId || !sessionId) {
      throw new HttpError("Peer listing requires channel and session identity.", {
        status: 400,
        code: "managed_peers_invalid"
      });
    }

    const now = nowIso();
    this.cleanupStaleState(now);
    this.requireJoinedMembership(sessionId);
    const cutoff = addMs(now, -this.getPresenceTtlMs());

    const peerRows = this.ctx.storage.sql
      .exec<{
        session_id: string;
        user_id: string;
        display_name: string;
      }>(
        `SELECT session_id, user_id, display_name
         FROM memberships
         WHERE membership_state = 'joined'
           AND last_seen_at >= ?
           AND session_id != ?
         GROUP BY session_id, user_id, display_name
         ORDER BY display_name ASC`,
        cutoff,
        sessionId
      )
      .toArray();

    const peers = peerRows.map((peer) => {
      const endpoints = this.ctx.storage.sql
        .exec<{
          endpoint_id: string;
          kind: string;
          ip: string;
          port: number;
          registration_state: string;
          last_validated_at: string;
        }>(
          `SELECT DISTINCT e.endpoint_id, e.kind, e.ip, e.port, e.registration_state, e.last_validated_at
           FROM endpoints e
           INNER JOIN memberships m
             ON m.session_id = e.session_id
            AND m.slot_id = e.slot_id
           WHERE e.session_id = ?
             AND m.membership_state = 'joined'
             AND m.last_seen_at >= ?
           ORDER BY e.kind ASC, e.ip ASC, e.port ASC`,
          peer.session_id,
          cutoff
        )
        .toArray()
        .map((endpoint) => ({
          endpointId: endpoint.endpoint_id,
          kind: endpoint.kind,
          ip: endpoint.ip,
          port: Number(endpoint.port),
          registrationState: endpoint.registration_state,
          lastValidatedAt: endpoint.last_validated_at
        }));

      return {
        userId: peer.user_id,
        sessionId: peer.session_id,
        channelId,
        displayName: peer.display_name,
        connectionState: "idle",
        endpoints
      };
    }).filter((peer) => Array.isArray(peer.endpoints) && peer.endpoints.length > 0);

    return jsonResponse({
      channelId,
      peers,
      resolvedAt: now
    });
  }

  async handleLeave(request: Request): Promise<Response> {
    const body = await readJsonBody(request);
    const channelId = stringOrEmpty(body.channelId).trim();
    const sessionId = stringOrEmpty(body.sessionId).trim();
    const slotId = sanitizeSlotId(body.slotId);
    const leftAt = nowIso();
    if (sessionId) {
      this.ctx.storage.sql.exec(
        `UPDATE memberships
         SET membership_state = 'none',
             online_state = 'offline',
             left_at = ?,
             last_seen_at = ?
         WHERE session_id = ? AND slot_id = ?`,
        leftAt,
        leftAt,
        sessionId,
        slotId
      );
      this.ctx.storage.sql.exec(
        `DELETE FROM endpoints
         WHERE session_id = ? AND slot_id = ?`,
        sessionId,
        slotId
      );
    }
    this.cleanupStaleState(leftAt);
    return jsonResponse({
      membership: {
        channelId,
        slotId,
        membershipState: "none",
        leftAt
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") return emptyResponse();
      if (request.method === "GET" && url.pathname === "/internal/member-count") {
        return await this.handleMemberCount();
      }
      if (request.method === "GET" && url.pathname === "/internal/admin-summary") {
        return await this.handleAdminSummary();
      }
      if (request.method === "POST" && url.pathname === "/internal/join") {
        return await this.handleJoin(request);
      }
      if (request.method === "POST" && url.pathname === "/internal/presence") {
        return await this.handlePresence(request);
      }
      if (request.method === "GET" && url.pathname === "/internal/peers") {
        return await this.handlePeers(request);
      }
      if (request.method === "POST" && url.pathname === "/internal/leave") {
        return await this.handleLeave(request);
      }
      if (request.method === "GET" && url.pathname === "/internal/health") {
        return jsonResponse({ status: "ok", object: "channel" });
      }
      return jsonResponse(
        {
          code: "managed_not_found",
          message: "Channel route not found."
        },
        404
      );
    } catch (error) {
      return errorResponse(error);
    }
  }
}

// Keep the original exported class name alive so Cloudflare can continue to
// understand the historical migration graph, even though new bindings use V2.
export class ChannelDO extends ChannelDOManagedV2 {}

function getDirectoryStub(env: Env): DurableObjectStub {
  const id = env.DIRECTORY_DO.idFromName(DIRECTORY_OBJECT_NAME);
  return env.DIRECTORY_DO.get(id);
}

function getChannelStub(env: Env, channelId: string): DurableObjectStub {
  const id = env.CHANNEL_DO.idFromName(channelId);
  return env.CHANNEL_DO.get(id);
}

async function requireSession(env: Env, sessionId: string): Promise<SessionRecord> {
  const directory = getDirectoryStub(env);
  const response = await fetchStubJson<{ session: SessionRecord }>(
    directory,
    `https://directory/internal/session?sessionId=${encodeURIComponent(sessionId)}`
  );
  return response.session;
}

async function requireChannel(env: Env, channelId: string): Promise<StoredChannelConfig> {
  const directory = getDirectoryStub(env);
  const response = await fetchStubJson<{ channel: StoredChannelConfig }>(
    directory,
    `https://directory/internal/channel-config?channelId=${encodeURIComponent(channelId)}`
  );
  return response.channel;
}

async function getSlotMembership(env: Env, sessionId: string, slotId: string): Promise<SlotMembershipRecord | null> {
  const directory = getDirectoryStub(env);
  const response = await fetchStubJson<{ membership: SlotMembershipRecord | null }>(
    directory,
    `https://directory/internal/slot-membership?sessionId=${encodeURIComponent(sessionId)}&slotId=${encodeURIComponent(slotId)}`
  );
  return response.membership || null;
}

async function setSlotMembership(env: Env, sessionId: string, slotId: string, channelId: string): Promise<void> {
  const directory = getDirectoryStub(env);
  await fetchStubJson<JsonObject>(directory, "https://directory/internal/slot-membership/set", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId,
      slotId,
      channelId
    })
  });
}

async function clearSlotMembership(env: Env, sessionId: string, slotId: string, channelId?: string): Promise<void> {
  const directory = getDirectoryStub(env);
  await fetchStubJson<JsonObject>(directory, "https://directory/internal/slot-membership/clear", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId,
      slotId,
      channelId: channelId || null
    })
  });
}

async function assertSessionInChannel(env: Env, sessionId: string, channelId: string): Promise<boolean> {
  const directory = getDirectoryStub(env);
  const response = await fetchStubJson<{ joined: boolean }>(
    directory,
    `https://directory/internal/channel-membership?sessionId=${encodeURIComponent(sessionId)}&channelId=${encodeURIComponent(channelId)}`
  );
  return !!response.joined;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") return emptyResponse();

      if (request.method === "GET" && url.pathname === "/") {
        return textResponse("1492-backend-dev is online (Free Tier SQLite Mode).");
      }

      if (request.method === "GET" && url.pathname === "/api/health") {
        return jsonResponse({
          status: "ok",
          service: "1492-backend-dev",
          storage: "durable-objects-sqlite"
        });
      }

      if (request.method === "POST" && url.pathname === "/api/session/open") {
        const directory = getDirectoryStub(env);
        const body = await request.text();
        const payload = await fetchStubJson<JsonObject>(directory, "https://directory/internal/session/open", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body
        });
        return jsonResponse(payload);
      }

      if (request.method === "GET" && url.pathname === "/api/channels") {
        const sessionId = url.searchParams.get("sessionId") || "";
        const directory = getDirectoryStub(env);
        const payload = await fetchStubJson<JsonObject>(
          directory,
          `https://directory/internal/channels?sessionId=${encodeURIComponent(sessionId)}`
        );
        return jsonResponse(payload);
      }

      if (request.method === "GET" && url.pathname === "/api/admin/summary") {
        const sessionId = url.searchParams.get("sessionId") || "";
        const directory = getDirectoryStub(env);
        const payload = await fetchStubJson<JsonObject>(
          directory,
          `https://directory/internal/admin-summary?sessionId=${encodeURIComponent(sessionId)}`
        );
        return jsonResponse(payload);
      }

      if (request.method === "POST" && url.pathname === "/api/admin/channels/create") {
        const directory = getDirectoryStub(env);
        const body = await request.text();
        const payload = await fetchStubJson<JsonObject>(directory, "https://directory/internal/admin/channels/create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body
        });
        return jsonResponse(payload, 201);
      }

      if (request.method === "POST" && url.pathname === "/api/admin/channels/update") {
        const directory = getDirectoryStub(env);
        const body = await request.text();
        const payload = await fetchStubJson<JsonObject>(directory, "https://directory/internal/admin/channels/update", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body
        });
        return jsonResponse(payload);
      }

      if (request.method === "POST" && url.pathname === "/api/admin/channels/delete") {
        const directory = getDirectoryStub(env);
        const body = await request.text();
        const payload = await fetchStubJson<JsonObject>(directory, "https://directory/internal/admin/channels/delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body
        });
        return jsonResponse(payload);
      }

      const channelMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/(join|presence|peers|leave)$/);
      if (channelMatch) {
        const channelId = decodeURIComponent(channelMatch[1]);
        const action = channelMatch[2];
        const channel = await requireChannel(env, channelId);
        const channelStub = getChannelStub(env, channelId);

        if (action === "join" && request.method === "POST") {
          const body = await readJsonBody(request);
          const sessionId = stringOrEmpty(body.sessionId).trim();
          const session = await requireSession(env, sessionId);
          const slotId = sanitizeSlotId(body.slotId);
          const providedPasscode = stringOrEmpty(body.passcode).trim();
          if (channel.requiresPasscode) {
            if (!providedPasscode) {
              throw new HttpError(
                "This channel requires a passcode before you can join it.",
                {
                  status: 403,
                  code: "managed_passcode_required"
                }
              );
            }
            const passcodeValid = await verifyPasscodeSecret(providedPasscode, channel);
            if (!passcodeValid) {
              throw new HttpError(
                "The supplied passcode is invalid for this channel.",
                {
                  status: 403,
                  code: "managed_passcode_invalid"
                }
              );
            }
          }
          const previousMembership = await getSlotMembership(env, sessionId, slotId);
          const payload = await fetchStubJson<{ membership: MembershipResponse }>(
            channelStub,
            "https://channel/internal/join",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                channelId,
                sessionId,
                userId: session.userId,
                displayName: session.displayName,
                slotId
              })
            }
          );
          if (previousMembership?.channelId && previousMembership.channelId !== channelId) {
            const previousChannelStub = getChannelStub(env, previousMembership.channelId);
            await fetchStubJson<JsonObject>(
              previousChannelStub,
              "https://channel/internal/leave",
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  channelId: previousMembership.channelId,
                  sessionId,
                  slotId
                })
              }
            );
          }
          await setSlotMembership(env, sessionId, slotId, channelId);
          const countPayload = await fetchStubJson<ChannelCountResponse>(
            channelStub,
            "https://channel/internal/member-count"
          );
          return jsonResponse({
            membership: payload.membership,
            channel: normalizeChannelForClient(channel, Number(countPayload.memberCount) || 0)
          });
        }

        if (action === "presence" && request.method === "POST") {
          const body = await readJsonBody(request);
          const sessionId = stringOrEmpty(body.sessionId).trim();
          const session = await requireSession(env, sessionId);
          const slotId = sanitizeSlotId(body.slotId);
          const membership = await getSlotMembership(env, sessionId, slotId);
          if (!membership || membership.channelId !== channelId) {
            throw new HttpError("Managed channel membership is no longer active.", {
              status: 409,
              code: "managed_membership_required"
            });
          }
          const payload = await fetchStubJson<JsonObject>(
            channelStub,
            "https://channel/internal/presence",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                channelId,
                sessionId,
                userId: session.userId,
                displayName: session.displayName,
                slotId,
                onlineState: stringOrEmpty(body.onlineState).trim() || "online",
                endpoints: Array.isArray(body.endpoints) ? body.endpoints : []
              })
            }
          );
          return jsonResponse(payload);
        }

        if (action === "peers" && request.method === "GET") {
          const sessionId = url.searchParams.get("sessionId") || "";
          await requireSession(env, sessionId);
          const joined = await assertSessionInChannel(env, sessionId, channelId);
          if (!joined) {
            throw new HttpError("Managed channel membership is no longer active.", {
              status: 409,
              code: "managed_membership_required"
            });
          }
          const payload = await fetchStubJson<JsonObject>(
            channelStub,
            `https://channel/internal/peers?channelId=${encodeURIComponent(channelId)}&sessionId=${encodeURIComponent(sessionId)}`
          );
          return jsonResponse(payload);
        }

        if (action === "leave" && request.method === "POST") {
          const body = await readJsonBody(request);
          const sessionId = stringOrEmpty(body.sessionId).trim();
          const slotId = sanitizeSlotId(body.slotId);
          if (sessionId) {
            try {
              await requireSession(env, sessionId);
            } catch (error) {
              if (!(error instanceof HttpError) || error.status !== 401) throw error;
            }
          }
          const payload = await fetchStubJson<JsonObject>(
            channelStub,
            "https://channel/internal/leave",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                channelId,
                sessionId,
                slotId
              })
            }
          );
          if (sessionId) {
            await clearSlotMembership(env, sessionId, slotId, channelId);
          }
          return jsonResponse(payload);
        }
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/test-channel")) {
        const stub = getChannelStub(env, "chn_alpha");
        const payload = await fetchStubJson<JsonObject>(stub, "https://channel/internal/health");
        return jsonResponse(payload);
      }

      return jsonResponse(
        {
          code: "managed_not_found",
          message: "Not Found"
        },
        404
      );
    } catch (error) {
      return errorResponse(error);
    }
  }
};
