import { toast } from "@heroui/react";
import type { Json } from "@repo/database";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Dispatch, SetStateAction } from "react";
import {
	type Agent,
	createAgent,
	createAgentVersion,
	type Tag,
	updateAgent,
} from "@/lib/queries";
import type { AgentFormValues } from "../types";

export const useAgentMutations = ({
	name,
	agentId,
	workspaceId,
	setVersionId,
}: {
	name: string;
	agentId: string;
	workspaceId: string;
	setVersionId: Dispatch<SetStateAction<string | undefined>>;
}) => {
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	// Create mutation (creates both the agent and its first, undeployed version)
	const createMutation = useMutation({
		mutationFn: async (values: AgentFormValues) => {
			const agent = await createAgent(workspaceId, name);
			await createAgentVersion(
				workspaceId,
				agent.id,
				values as unknown as Json,
			);
			return agent.id;
		},
		onSuccess: (newAgentId) => {
			queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
			toast.success("Agent created successfully.");
			navigate({
				to: "/workspace/$workspaceId/agents/$agentId",
				params: { workspaceId, agentId: newAgentId },
			});
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to create agent.",
			);
		},
	});

	// Update mutation (creates a new, undeployed version)
	const updateMutation = useMutation({
		mutationFn: (values: AgentFormValues) =>
			createAgentVersion(workspaceId, agentId, values as unknown as Json),
		onSuccess: (version) => {
			queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
			queryClient.invalidateQueries({ queryKey: ["agent-versions", agentId] });
			// Seed the detail cache so the editor has the new version's data without
			// a refetch, then select it.
			queryClient.setQueryData(["agent-version", version.id], version);
			setVersionId(version.id);
			toast.success("New version created successfully.");
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error
					? error.message
					: "Failed to create new version.",
			);
		},
	});

	const updateNameMutation = useMutation({
		mutationFn: (name: string) => updateAgent(workspaceId, agentId, { name }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
			queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to update agent name.",
			);
		},
	});

	// Deploy mutation - deploys a version to an environment (staging or production)
	const deployMutation = useMutation({
		mutationFn: ({
			version_id,
			environment,
		}: {
			version_id: string;
			environment: "staging" | "production";
		}) =>
			updateAgent(
				workspaceId,
				agentId,
				environment === "staging"
					? { staging_version_id: version_id }
					: { production_version_id: version_id },
			),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
			queryClient.invalidateQueries({ queryKey: ["agent-versions", agentId] });
			toast.success(
				`Version deployed to ${variables.environment} successfully.`,
			);
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to deploy version.",
			);
		},
	});

	// Sync tags mutation - replaces the agent's full tag set (with optimistic update)
	const syncTagsMutation = useMutation({
		mutationFn: (tagIds: string[]) =>
			updateAgent(workspaceId, agentId, { tag_ids: tagIds }),
		onMutate: async (tagIds) => {
			// Cancel outgoing refetches so they don't clobber the optimistic update.
			await queryClient.cancelQueries({ queryKey: ["agent", agentId] });

			const previousAgent = queryClient.getQueryData<Agent>(["agent", agentId]);

			// Build the optimistic tag set from the workspace tags cache.
			const tagsData = queryClient.getQueryData<Tag[]>(["tags", workspaceId]);
			const optimisticTags = tagIds
				.map((id) => tagsData?.find((t) => t.id === id))
				.filter((t): t is Tag => Boolean(t))
				.map((t) => ({ id: t.id, name: t.name, color: t.color }));

			if (previousAgent) {
				queryClient.setQueryData<Agent>(["agent", agentId], {
					...previousAgent,
					tags: optimisticTags,
				});
			}

			return { previousAgent };
		},
		onError: (error, _, context) => {
			if (context?.previousAgent) {
				queryClient.setQueryData(["agent", agentId], context.previousAgent);
			}
			toast.danger(
				error instanceof Error ? error.message : "Failed to update tags.",
			);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
			queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
		},
	});

	return {
		createMutation,
		updateMutation,
		updateNameMutation,
		deployMutation,
		syncTagsMutation,
	};
};
