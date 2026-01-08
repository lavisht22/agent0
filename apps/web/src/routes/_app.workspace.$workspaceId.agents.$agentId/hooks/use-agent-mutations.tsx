import { addToast } from "@heroui/react";
import type { Json, Tables } from "@repo/database";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import type { Dispatch, SetStateAction } from "react";
import { supabase } from "@/lib/supabase";
import type { AgentFormValues } from "../types";

export const useAgentMutations = ({
	name,
	agentId,
	workspaceId,
	setVersion,
}: {
	name: string;
	agentId: string;
	workspaceId: string;
	setVersion: Dispatch<SetStateAction<Tables<"versions"> | undefined>>;
}) => {
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	// Create mutation (creates both agent and first version)
	const createMutation = useMutation({
		mutationFn: async (values: AgentFormValues) => {
			const newAgentId = nanoid();
			const newVersionId = nanoid();

			// Create agent
			const { error: agentError } = await supabase.from("agents").insert({
				id: newAgentId,
				name,
				workspace_id: workspaceId,
			});

			if (agentError) throw agentError;

			// Create first version
			const { error: versionError } = await supabase.from("versions").insert({
				id: newVersionId,
				agent_id: newAgentId,
				data: values as unknown as Json,
				is_deployed: false,
			});

			if (versionError) throw versionError;

			return newAgentId;
		},
		onSuccess: (newAgentId) => {
			queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
			addToast({
				description: "Agent created successfully.",
				color: "success",
			});
			navigate({
				to: "/workspace/$workspaceId/agents/$agentId",
				params: { workspaceId, agentId: newAgentId },
			});
		},
		onError: (error) => {
			addToast({
				description:
					error instanceof Error ? error.message : "Failed to create agent.",
				color: "danger",
			});
		},
	});

	// Update mutation (creates new version)
	const updateMutation = useMutation({
		mutationFn: async (values: AgentFormValues) => {
			const newVersionId = nanoid();

			// Create new version
			const { data: version, error: versionError } = await supabase
				.from("versions")
				.insert({
					id: newVersionId,
					agent_id: agentId,
					data: values as unknown as Json,
					is_deployed: false,
				})
				.select()
				.single();

			if (versionError) throw versionError;

			return version;
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
			queryClient.invalidateQueries({ queryKey: ["agent-versions", agentId] });
			setVersion(data);
			addToast({
				description: "New version created successfully.",
				color: "success",
			});
		},
		onError: (error) => {
			addToast({
				description:
					error instanceof Error
						? error.message
						: "Failed to create new version.",
				color: "danger",
			});
		},
	});

	const updateNameMutation = useMutation({
		mutationFn: async (name: string) => {
			const { error } = await supabase
				.from("agents")
				.update({ name })
				.eq("id", agentId);

			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
			queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
		},
		onError: (error) => {
			addToast({
				description:
					error instanceof Error
						? error.message
						: "Failed to update agent name.",
				color: "danger",
			});
		},
	});

	// Deploy mutation - deploys a version to an environment (staging or production)
	const deployMutation = useMutation({
		mutationFn: async ({
			version_id,
			environment,
		}: {
			version_id: string;
			environment: "staging" | "production";
		}) => {
			// Update the agent's staging or production version ID
			const updateField =
				environment === "staging"
					? { staging_version_id: version_id }
					: { production_version_id: version_id };

			const { error } = await supabase
				.from("agents")
				.update(updateField)
				.eq("id", agentId)
				.throwOnError();

			if (error) throw error;

			return { version_id, environment };
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
			queryClient.invalidateQueries({ queryKey: ["agent-versions", agentId] });
			addToast({
				description: `Version deployed to ${variables.environment} successfully.`,
				color: "success",
			});
		},
		onError: (error) => {
			addToast({
				description:
					error instanceof Error ? error.message : "Failed to deploy version.",
				color: "danger",
			});
		},
	});

	// Sync tags mutation - replaces all agent tags with new ones (with optimistic updates)
	const syncTagsMutation = useMutation({
		mutationFn: async (tagIds: string[]) => {
			// Delete existing agent tags
			const { error: deleteError } = await supabase
				.from("agent_tags")
				.delete()
				.eq("agent_id", agentId);

			if (deleteError) throw deleteError;

			// Insert new agent tags
			if (tagIds.length > 0) {
				const { error: insertError } = await supabase
					.from("agent_tags")
					.insert(
						tagIds.map((tagId) => ({ agent_id: agentId, tag_id: tagId })),
					);

				if (insertError) throw insertError;
			}
		},
		onMutate: async (tagIds) => {
			// Cancel any outgoing refetches to avoid overwriting optimistic update
			await queryClient.cancelQueries({ queryKey: ["agent-tags", agentId] });

			// Snapshot the previous value
			const previousAgentTags = queryClient.getQueryData([
				"agent-tags",
				agentId,
			]);

			// Get the tags data to create proper optimistic entries
			const tagsData = queryClient.getQueryData(["tags", workspaceId]) as
				| { id: string; name: string; color: string; workspace_id: string }[]
				| undefined;

			// Optimistically update the cache with new tag structure
			const optimisticAgentTags = tagIds.map((tagId) => {
				const tag = tagsData?.find((t) => t.id === tagId);
				return {
					agent_id: agentId,
					tag_id: tagId,
					tags: tag || null,
				};
			});

			queryClient.setQueryData(["agent-tags", agentId], optimisticAgentTags);

			// Return context with the previous value for rollback
			return { previousAgentTags };
		},
		onError: (error, _, context) => {
			// Rollback to previous value on error
			if (context?.previousAgentTags) {
				queryClient.setQueryData(
					["agent-tags", agentId],
					context.previousAgentTags,
				);
			}
			addToast({
				description:
					error instanceof Error ? error.message : "Failed to update tags.",
				color: "danger",
			});
		},
		onSettled: () => {
			// Always refetch after error or success to ensure consistency
			queryClient.invalidateQueries({ queryKey: ["agent-tags", agentId] });
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
