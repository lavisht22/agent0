import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	foreignKey,
	index,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

/**
 * Drizzle schema for the whole agent0 database — Phase 3 of the Supabase ->
 * self-contained migration. Curated from `drizzle-kit pull` against the live
 * Supabase Postgres (see drizzle.config.ts).
 *
 * Two deliberate deviations from the raw introspection output:
 *
 *  1. **RLS `pgPolicy` blocks are stripped.** RLS stays enabled + dormant in the
 *     DB as a defense-in-depth backstop (the runner connects as the service role
 *     and bypasses it); the runtime Drizzle client never needs the policy
 *     definitions. When we adopt Drizzle Kit migrations (later in Phase 3) the
 *     baseline is re-introspected, so they're reconstructed there if needed.
 *
 *  2. **better-auth tables use Date-mode timestamps; app tables use string-mode.**
 *     The app tables (agents, runs, …) return ISO strings to match what the
 *     Supabase SDK returned (and what `database.types.ts` types them as), so
 *     route handlers are unchanged. The four better-auth-owned tables
 *     (`users`, `sessions`, `accounts`, `verifications`) keep Date-mode
 *     timestamps because better-auth's drizzle adapter works with JS `Date`s.
 *     `users` is shared, but the app only reads its text columns (name/email),
 *     so Date-mode timestamps there are invisible to app code.
 */

export const workspaceUserRole = pgEnum("workspace_user_role", [
	"admin",
	"writer",
	"reader",
]);

// ---------------------------------------------------------------------------
// better-auth-owned tables (Date-mode timestamps)
// ---------------------------------------------------------------------------

export const users = pgTable(
	"users",
	{
		id: uuid().primaryKey().notNull(),
		name: text(),
		email: text().notNull(),
		emailVerified: boolean("email_verified").default(false).notNull(),
		image: text(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("users_email_key").using(
			"btree",
			table.email.asc().nullsLast().op("text_ops"),
		),
	],
);

export const sessions = pgTable(
	"sessions",
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		token: text().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: uuid("user_id").notNull(),
	},
	(table) => [
		index("sessions_user_id_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("uuid_ops"),
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "sessions_user_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		unique("sessions_token_key").on(table.token),
	],
);

export const accounts = pgTable(
	"accounts",
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: uuid("user_id").notNull(),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text(),
		password: text(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("accounts_user_id_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("uuid_ops"),
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "accounts_user_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
	],
);

export const verifications = pgTable(
	"verifications",
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		identifier: text().notNull(),
		value: text().notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("verifications_identifier_idx").using(
			"btree",
			table.identifier.asc().nullsLast().op("text_ops"),
		),
	],
);

/** Combined object passed to better-auth's `drizzleAdapter({ schema })`. */
export const authSchema = { users, sessions, accounts, verifications };

// ---------------------------------------------------------------------------
// App tables (string-mode timestamps — parity with the Supabase SDK)
// ---------------------------------------------------------------------------

export const workspaces = pgTable(
	"workspaces",
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		userId: uuid("user_id")
			.default(sql`auth.uid()`)
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "workspaces_user_id_fkey",
		}),
	],
);

export const workspaceUser = pgTable(
	"workspace_user",
	{
		userId: uuid("user_id").notNull(),
		workspaceId: text("workspace_id").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		role: workspaceUserRole().default("reader").notNull(),
	},
	(table) => [
		index("workspace_user_user_id_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("uuid_ops"),
		),
		index("workspace_user_workspace_id_idx").using(
			"btree",
			table.workspaceId.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "workspace_user_user_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "workspace_user_workspace_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		primaryKey({
			columns: [table.userId, table.workspaceId],
			name: "workspace_user_pkey",
		}),
	],
);

export const tags = pgTable(
	"tags",
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		color: text().default("#6366f1").notNull(),
		workspaceId: text("workspace_id").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("tags_workspace_id_idx").using(
			"btree",
			table.workspaceId.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "tahs_workspace_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
	],
);

export const agents = pgTable(
	"agents",
	{
		id: text().primaryKey().notNull(),
		workspaceId: text("workspace_id").notNull(),
		name: text().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		// Inline `.references()` with an `AnyPgColumn` annotation breaks the
		// agents <-> agent_versions type cycle that `declaration: true` can't
		// otherwise resolve (the table-level `foreignKey()` form can't here).
		stagingVersionId: text("staging_version_id").references(
			(): AnyPgColumn => agentVersions.id,
		),
		productionVersionId: text("production_version_id").references(
			(): AnyPgColumn => agentVersions.id,
		),
	},
	(table) => [
		index("agents_production_version_idx")
			.using(
				"btree",
				table.productionVersionId.asc().nullsLast().op("text_ops"),
			)
			.where(sql`(production_version_id IS NOT NULL)`),
		index("agents_staging_version_idx")
			.using("btree", table.stagingVersionId.asc().nullsLast().op("text_ops"))
			.where(sql`(staging_version_id IS NOT NULL)`),
		index("agents_workspace_id_idx").using(
			"btree",
			table.workspaceId.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "agents_workspace_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
	],
);

export const agentVersions = pgTable(
	"agent_versions",
	{
		id: text().primaryKey().notNull(),
		agentId: text("agent_id").notNull(),
		data: jsonb().notNull(),
		isDeployed: boolean("is_deployed").default(false).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		userId: uuid("user_id")
			.default(sql`auth.uid()`)
			.notNull(),
	},
	(table) => [
		index("agent_versions_agent_id_idx").using(
			"btree",
			table.agentId.asc().nullsLast().op("text_ops"),
		),
		index("agent_versions_agent_id_is_deployed_idx")
			.using("btree", table.agentId.asc().nullsLast().op("text_ops"))
			.where(sql`(is_deployed IS TRUE)`),
		foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.id],
			name: "agent_versions_agent_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "agent_versions_user_id_fkey",
		}),
	],
);

export const agentTags = pgTable(
	"agent_tags",
	{
		agentId: text("agent_id").notNull(),
		tagId: text("tag_id").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("agent_tags_agent_id_idx").using(
			"btree",
			table.agentId.asc().nullsLast().op("text_ops"),
		),
		index("agent_tags_tag_id_idx").using(
			"btree",
			table.tagId.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.id],
			name: "agent_tags_agent_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.tagId],
			foreignColumns: [tags.id],
			name: "agent_tags_tag_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		primaryKey({
			columns: [table.agentId, table.tagId],
			name: "agent_tags_pkey",
		}),
	],
);

export const providers = pgTable(
	"providers",
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		type: text().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		workspaceId: text("workspace_id").notNull(),
		encryptedDataProduction: text("encrypted_data_production").notNull(),
		encryptedDataStaging: text("encrypted_data_staging"),
	},
	(table) => [
		index("providers_workspace_id_idx").using(
			"btree",
			table.workspaceId.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "providers_workspace_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
	],
);

export const mcps = pgTable(
	"mcps",
	{
		id: text().primaryKey().notNull(),
		workspaceId: text("workspace_id").notNull(),
		encryptedDataProduction: jsonb("encrypted_data_production").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		name: text().notNull(),
		tools: jsonb(),
		customHeaders: text("custom_headers").default("").notNull(),
		encryptedDataStaging: jsonb("encrypted_data_staging"),
	},
	(table) => [
		index("mcps_workspace_id_idx").using(
			"btree",
			table.workspaceId.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "mcps_workspace_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
	],
);

export const runs = pgTable(
	"runs",
	{
		id: text().primaryKey().notNull(),
		workspaceId: text("workspace_id").notNull(),
		versionId: text("version_id"),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		isError: boolean("is_error").default(false).notNull(),
		isTest: boolean("is_test").default(false).notNull(),
		preProcessingTime: numeric("pre_processing_time").notNull(),
		firstTokenTime: numeric("first_token_time").notNull(),
		responseTime: numeric("response_time").notNull(),
		isStream: boolean("is_stream"),
		tokens: numeric(),
		cost: numeric(),
		parentRunId: text("parent_run_id"),
	},
	(table) => [
		index("runs_created_at_idx").using(
			"btree",
			table.createdAt.asc().nullsLast().op("timestamptz_ops"),
		),
		index("runs_parent_run_id_idx").using(
			"btree",
			table.parentRunId.asc().nullsLast().op("text_ops"),
		),
		index("runs_workspace_id_idx").using(
			"btree",
			table.workspaceId.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.versionId],
			foreignColumns: [agentVersions.id],
			name: "runs_agent_version_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("set null"),
		foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "runs_workspace_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
	],
);

export const apiKeys = pgTable(
	"api_keys",
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		userId: uuid("user_id").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		workspaceId: text("workspace_id").notNull(),
		key: text().notNull(),
		scopes: text().array().default(["*:*:*"]).notNull(),
		allowedOrigins: text("allowed_origins").array(),
	},
	(table) => [
		index("api_keys_workspace_id_idx").using(
			"btree",
			table.workspaceId.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "api_keys_user_id_fkey",
		}),
		foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "api_keys_workspace_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		unique("api_keys_key_key").on(table.key),
	],
);

export const personalAccessTokens = pgTable(
	"personal_access_tokens",
	{
		id: text().primaryKey().notNull(),
		userId: uuid("user_id").notNull(),
		tokenHash: text("token_hash").notNull(),
		tokenPrefix: text("token_prefix").notNull(),
		name: text().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		lastUsedAt: timestamp("last_used_at", {
			withTimezone: true,
			mode: "string",
		}),
		expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
		revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
	},
	(table) => [
		index("personal_access_tokens_user_id_idx").using(
			"btree",
			table.userId.asc().nullsLast().op("uuid_ops"),
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "personal_access_tokens_user_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		unique("personal_access_tokens_token_hash_key").on(table.tokenHash),
	],
);
