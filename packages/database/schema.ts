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
 * Drizzle schema for the agent0 database.
 *
 * App-table columns are named in snake_case so query results, the DB columns,
 * and the HTTP JSON contract all share one casing with no translation layer.
 * The four better-auth-owned tables (`users`, `sessions`, `accounts`,
 * `verifications`) keep camelCase fields + Date-mode timestamps because
 * better-auth's drizzle adapter expects them; app tables use string-mode
 * timestamps.
 */

/**
 * JSON value type for `jsonb` columns. Drizzle infers `jsonb` as `unknown`;
 * this gives consumers a structured type to assert against at the boundary.
 */
export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

export const workspaceUserRole = pgEnum("workspace_user_role", [
	"admin",
	"writer",
	"reader",
]);

// ---------------------------------------------------------------------------
// better-auth-owned tables (camelCase fields, Date-mode timestamps)
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
// App tables (snake_case fields, string-mode timestamps)
// ---------------------------------------------------------------------------

export const workspaces = pgTable(
	"workspaces",
	{
		id: text().primaryKey().notNull(),
		name: text().notNull(),
		created_at: timestamp({ withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		user_id: uuid().notNull(),
		updated_at: timestamp({ withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.user_id],
			foreignColumns: [users.id],
			name: "workspaces_user_id_fkey",
		}),
	],
);

export const workspaceUser = pgTable(
	"workspace_user",
	{
		user_id: uuid().notNull(),
		workspace_id: text().notNull(),
		created_at: timestamp({ withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		updated_at: timestamp({ withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		role: workspaceUserRole().default("reader").notNull(),
	},
	(table) => [
		index("workspace_user_user_id_idx").using(
			"btree",
			table.user_id.asc().nullsLast().op("uuid_ops"),
		),
		index("workspace_user_workspace_id_idx").using(
			"btree",
			table.workspace_id.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.user_id],
			foreignColumns: [users.id],
			name: "workspace_user_user_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.workspace_id],
			foreignColumns: [workspaces.id],
			name: "workspace_user_workspace_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		primaryKey({
			columns: [table.user_id, table.workspace_id],
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
		workspace_id: text().notNull(),
		created_at: timestamp({ withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		updated_at: timestamp({ withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("tags_workspace_id_idx").using(
			"btree",
			table.workspace_id.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.workspace_id],
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
		workspace_id: text().notNull(),
		name: text().notNull(),
		created_at: timestamp({ withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		updated_at: timestamp({ withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		// Inline `.references()` with an `AnyPgColumn` annotation breaks the
		// agents <-> agent_versions type cycle that `declaration: true` can't
		// otherwise resolve (the table-level `foreignKey()` form can't here).
		staging_version_id: text().references((): AnyPgColumn => agentVersions.id),
		production_version_id: text().references(
			(): AnyPgColumn => agentVersions.id,
		),
	},
	(table) => [
		index("agents_production_version_idx")
			.using(
				"btree",
				table.production_version_id.asc().nullsLast().op("text_ops"),
			)
			.where(sql`(production_version_id IS NOT NULL)`),
		index("agents_staging_version_idx")
			.using("btree", table.staging_version_id.asc().nullsLast().op("text_ops"))
			.where(sql`(staging_version_id IS NOT NULL)`),
		index("agents_workspace_id_idx").using(
			"btree",
			table.workspace_id.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.workspace_id],
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
		agent_id: text().notNull(),
		data: jsonb().notNull(),
		is_deployed: boolean().default(false).notNull(),
		created_at: timestamp({ withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		user_id: uuid().notNull(),
	},
	(table) => [
		index("agent_versions_agent_id_idx").using(
			"btree",
			table.agent_id.asc().nullsLast().op("text_ops"),
		),
		index("agent_versions_agent_id_is_deployed_idx")
			.using("btree", table.agent_id.asc().nullsLast().op("text_ops"))
			.where(sql`(is_deployed IS TRUE)`),
		foreignKey({
			columns: [table.agent_id],
			foreignColumns: [agents.id],
			name: "agent_versions_agent_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.user_id],
			foreignColumns: [users.id],
			name: "agent_versions_user_id_fkey",
		}),
	],
);

export const agentTags = pgTable(
	"agent_tags",
	{
		agent_id: text().notNull(),
		tag_id: text().notNull(),
		created_at: timestamp({ withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("agent_tags_agent_id_idx").using(
			"btree",
			table.agent_id.asc().nullsLast().op("text_ops"),
		),
		index("agent_tags_tag_id_idx").using(
			"btree",
			table.tag_id.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.agent_id],
			foreignColumns: [agents.id],
			name: "agent_tags_agent_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.tag_id],
			foreignColumns: [tags.id],
			name: "agent_tags_tag_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		primaryKey({
			columns: [table.agent_id, table.tag_id],
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
		created_at: timestamp({ withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		updated_at: timestamp({ withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		workspace_id: text().notNull(),
		encrypted_data_production: text().notNull(),
		encrypted_data_staging: text(),
	},
	(table) => [
		index("providers_workspace_id_idx").using(
			"btree",
			table.workspace_id.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.workspace_id],
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
		workspace_id: text().notNull(),
		encrypted_data_production: jsonb().notNull(),
		created_at: timestamp({ withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		updated_at: timestamp({ withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		name: text().notNull(),
		tools: jsonb(),
		custom_headers: text().default("").notNull(),
		encrypted_data_staging: jsonb(),
	},
	(table) => [
		index("mcps_workspace_id_idx").using(
			"btree",
			table.workspace_id.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.workspace_id],
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
		workspace_id: text().notNull(),
		version_id: text(),
		created_at: timestamp({ withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		is_error: boolean().default(false).notNull(),
		is_test: boolean().default(false).notNull(),
		pre_processing_time: numeric().notNull(),
		first_token_time: numeric().notNull(),
		response_time: numeric().notNull(),
		is_stream: boolean(),
		tokens: numeric(),
		cost: numeric(),
		parent_run_id: text(),
	},
	(table) => [
		index("runs_created_at_idx").using(
			"btree",
			table.created_at.asc().nullsLast().op("timestamptz_ops"),
		),
		index("runs_parent_run_id_idx").using(
			"btree",
			table.parent_run_id.asc().nullsLast().op("text_ops"),
		),
		index("runs_workspace_id_idx").using(
			"btree",
			table.workspace_id.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.version_id],
			foreignColumns: [agentVersions.id],
			name: "runs_agent_version_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("set null"),
		foreignKey({
			columns: [table.workspace_id],
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
		user_id: uuid().notNull(),
		created_at: timestamp({ withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		workspace_id: text().notNull(),
		key: text().notNull(),
		scopes: text().array().default(["*:*:*"]).notNull(),
		allowed_origins: text().array(),
	},
	(table) => [
		index("api_keys_workspace_id_idx").using(
			"btree",
			table.workspace_id.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.user_id],
			foreignColumns: [users.id],
			name: "api_keys_user_id_fkey",
		}),
		foreignKey({
			columns: [table.workspace_id],
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
		user_id: uuid().notNull(),
		token_hash: text().notNull(),
		token_prefix: text().notNull(),
		name: text().notNull(),
		created_at: timestamp({ withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		last_used_at: timestamp({ withTimezone: true, mode: "string" }),
		expires_at: timestamp({ withTimezone: true, mode: "string" }),
		revoked_at: timestamp({ withTimezone: true, mode: "string" }),
	},
	(table) => [
		index("personal_access_tokens_user_id_idx").using(
			"btree",
			table.user_id.asc().nullsLast().op("uuid_ops"),
		),
		foreignKey({
			columns: [table.user_id],
			foreignColumns: [users.id],
			name: "personal_access_tokens_user_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		unique("personal_access_tokens_token_hash_key").on(table.token_hash),
	],
);
