import type { FastifyInstance } from "fastify";
import { supabase } from "../lib/db.js";
import { requireScope } from "../lib/scopes.js";

const ProviderSchema = {
	type: "object" as const,
	properties: {
		id: { type: "string" as const },
		name: { type: "string" as const },
		type: { type: "string" as const },
		has_staging_config: { type: "boolean" as const },
		created_at: { type: "string" as const, format: "date-time" },
		updated_at: { type: "string" as const, format: "date-time" },
	},
};

const ErrorSchema = {
	type: "object" as const,
	properties: {
		message: { type: "string" as const },
	},
};

export async function registerProvidersRoutes(fastify: FastifyInstance) {
	fastify.get("/providers", {
		preHandler: requireScope("providers:read:*"),
		schema: {
			tags: ["Providers"],
			summary: "List providers",
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: { type: "array" as const, items: ProviderSchema },
					},
				},
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request.params as { workspaceId: string };

			const { data, error } = await supabase
				.from("providers")
				.select("id, name, type, created_at, updated_at, encrypted_data_staging")
				.eq("workspace_id", workspaceId)
				.order("created_at", { ascending: false });

			if (error) {
				return reply.code(500).send({ message: "Failed to fetch providers" });
			}

			const result = data.map(({ encrypted_data_staging, ...rest }) => ({
				...rest,
				has_staging_config: !!encrypted_data_staging,
			}));

			return reply.send({ data: result });
		},
	});
}
