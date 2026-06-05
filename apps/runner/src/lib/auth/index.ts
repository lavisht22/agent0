import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { db } from "../pg.js";
import { sendSignInOtp } from "./email.js";
import { authSchema } from "./schema.js";

/**
 * better-auth instance — Phase 2 of the Supabase -> self-contained migration.
 *
 * Scope: this handles ONLY the browser-session credential — email-OTP login plus
 * an opaque, DB-backed session delivered as an **httpOnly cookie** (Phase 2
 * step 9: the session token never touches JS, so an XSS can't exfiltrate it).
 * The browser and runner are same-origin (the runner serves the SPA in prod; a
 * Vite proxy makes dev same-origin too), so cookies flow without CORS. PATs
 * (`x-pat`) and machine API keys (`x-api-key`) stay on agent0's own tables and
 * are resolved in lib/auth.ts; better-auth is not involved in those two paths.
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
	// In prod the browser origin === APP_URL (same-origin SPA). In dev the SPA is
	// on :2222 behind a Vite proxy, so its Origin header is :2222 — trust it so
	// better-auth's CSRF origin check accepts dev sign-in/sign-out requests.
	// (Listing :2222 in prod is harmless: a real browser's Origin can't be it.)
	trustedOrigins: [process.env.APP_URL, "http://localhost:2222"].filter(
		(o): o is string => Boolean(o),
	),
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
	// Cookie session (better-auth default). Secure flag is auto-derived from the
	// https APP_URL in prod; SameSite=Lax + same-origin requests cover CSRF.
	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 days
		updateAge: 60 * 60 * 24, // rolling refresh: extend expiry once per active day
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
	],
});
