import type { FastifyInstance } from "fastify";

// The deployable's version is the git tag, injected at image-build time via the
// APP_VERSION build arg (see the GHCR publish workflow). Falls back to "dev" for
// local or untagged builds — there is no hand-maintained package.json version.
const VERSION = process.env.APP_VERSION ?? "dev";

export async function registerVersionRoute(fastify: FastifyInstance) {
	// Unauthenticated, so the CLI can distinguish a wrong URL from a wrong token.
	fastify.get("/api/v1/version", {
		schema: {
			tags: ["Discovery"],
			summary: "Server identity and version",
			response: {
				200: {
					type: "object" as const,
					properties: {
						name: { type: "string" as const },
						version: { type: "string" as const },
						api: { type: "string" as const },
					},
				},
			},
		},
		handler: async (_request, reply) => {
			return reply.send({
				name: "agent0",
				version: VERSION,
				api: "v1",
			});
		},
	});
}
