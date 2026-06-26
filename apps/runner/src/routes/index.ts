import type { FastifyInstance } from "fastify";
import { addAuth } from "../lib/auth.js";
import { registerAgentRoutes } from "./agents.js";
import { registerApiKeysRoutes } from "./api-keys.js";
import { registerAuthRoutes } from "./auth.js";
import { registerBetterAuthRoutes } from "./better-auth.js";
import { registerDashboardRoutes } from "./dashboard.js";
import { registerEmbedRoutes } from "./embed.js";
import { registerInvitationsRoutes } from "./invitations.js";
import { registerMcpsRoutes } from "./mcps.js";
import { registerPersonalAccessTokensRoutes } from "./personal-access-tokens.js";
import { registerProvidersRoutes } from "./providers.js";
import { registerRunsRoutes } from "./runs.js";
import { registerTagsRoutes } from "./tags.js";
import { registerTestRoute } from "./test.js";
import { registerVersionRoute } from "./version.js";
import { registerWorkspacesRoute } from "./workspaces.js";

export async function registerRoutes(fastify: FastifyInstance) {
	// /internal routes authenticate the browser session inline, so they register
	// outside `addAuth`.
	await registerTestRoute(fastify);

	// Unauthenticated discovery — registered outside `addAuth`.
	await registerVersionRoute(fastify);

	// better-auth (/api/auth/*) issues credentials, so it can't require one;
	// registered outside `addAuth`.
	await registerBetterAuthRoutes(fastify);

	// Everything below goes through `addAuth`; state-mutating routes additionally
	// chain `requireUserId` to block machine API keys.
	await fastify.register(async (scoped) => {
		addAuth(scoped);

		await scoped.register(
			async (workspaceScoped) => {
				await registerRunsRoutes(workspaceScoped);
				await registerEmbedRoutes(workspaceScoped);
				await registerAgentRoutes(workspaceScoped);
				await registerTagsRoutes(workspaceScoped);
				await registerProvidersRoutes(workspaceScoped);
				await registerMcpsRoutes(workspaceScoped);
				await registerApiKeysRoutes(workspaceScoped);
				await registerDashboardRoutes(workspaceScoped);
			},
			{ prefix: "/api/v1/workspaces/:workspaceId" },
		);

		await registerAuthRoutes(scoped);
		await registerWorkspacesRoute(scoped);
		await registerInvitationsRoutes(scoped);
		await registerPersonalAccessTokensRoutes(scoped);
	});
}
