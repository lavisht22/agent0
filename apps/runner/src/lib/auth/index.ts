import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, emailOTP } from "better-auth/plugins";
import { db } from "../pg.js";
import { sendSignInOtp } from "./email.js";
import { authSchema } from "./schema.js";

/**
 * better-auth instance — Phase 2 of the Supabase -> self-contained migration.
 *
 * Scope: this handles ONLY the browser-session credential — email-OTP login plus
 * an opaque, DB-backed bearer session token sent in `Authorization: Bearer`.
 * PATs (`x-pat`) and machine API keys (`x-api-key`) stay on agent0's own tables
 * and are resolved in lib/auth.ts; better-auth is intentionally not involved in
 * those two paths (see the migration doc's revised D9/D11).
 *
 * Storage: the same Supabase Postgres as the rest of the app, via the Drizzle
 * connection in lib/pg.ts. The user model maps to the existing `users` table —
 * `usePlural: true` plus the adapter's default snake_case naming already line up
 * with our columns (`email_verified`, `created_at`, `updated_at`), so no field
 * overrides are needed. New users get UUID ids (`generateId: "uuid"`) to match
 * the existing rows' scheme, keeping every `user_id` FK homogeneous.
 *
 * The adapter `schema` (./schema.ts) was produced by `@better-auth/cli generate`
 * — tables users/sessions/accounts/verifications. The new three are created in
 * Supabase migration 20260605130000. (Phase 3 relocates this schema into a
 * properly-built `@repo/database`; see that file's note.)
 */
export const auth = betterAuth({
	baseURL: process.env.APP_URL,
	secret: process.env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, {
		provider: "pg",
		usePlural: true,
		schema: authSchema,
	}),
	advanced: {
		database: {
			generateId: "uuid",
		},
	},
	emailAndPassword: { enabled: false },
	plugins: [
		emailOTP({
			otpLength: 6,
			expiresIn: 300, // 5 minutes
			async sendVerificationOTP({ email, otp, type }) {
				if (type === "sign-in") {
					await sendSignInOtp(email, otp);
				}
			},
		}),
		bearer(),
	],
});
