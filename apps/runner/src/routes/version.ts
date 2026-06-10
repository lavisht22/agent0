import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";

const pkg = JSON.parse(
	readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };

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
				version: pkg.version,
				api: "v1",
			});
		},
	});
}
