import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";

const pkg = JSON.parse(
	readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };

export async function registerVersionRoute(fastify: FastifyInstance) {
	// Unauthenticated. Lets the CLI distinguish "wrong URL" (404, non-JSON,
	// or missing `name: "agent0"`) from "wrong token" (401 on a subsequent
	// authed call) during `agent0 login`.
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
