import { Button } from "@heroui/react";
import type { Json } from "@repo/database";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { z } from "zod";
import { Messages, type MessageT, messageSchema } from "@/components/messages";
import { ProviderSelector } from "@/components/provider-selector";
import { agentVersionsQuery, providersQuery } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { useState } from "react";

export const Route = createFileRoute(
	"/_app/workspace/$workspaceId/agents/$agentId",
)({
	component: RouteComponent,
});

// Zod schema for form validation
const agentFormSchema = z.object({
	provider: z.object({
		id: z.string(),
		model: z.string(),
	}),
	messages: z.array(messageSchema).min(1, "At least one message is required"),
});

function RouteComponent() {
	const { workspaceId, agentId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const isNewAgent = agentId === "new";
	const [generatedMessages, setGeneratedMessages] = useState<MessageT[]>([
		{
			role: "assistant",
			content: [{ type: "text", text: "Generated response will appear here." }],
		},
	]);

	// Fetch available providers
	const { data: providers, isLoading: isLoadingProviders } = useQuery(
		providersQuery(workspaceId),
	);

	// Fetch existing agent versions if editing
	const { data: versions, isLoading: isLoadingVersions } = useQuery({
		...agentVersionsQuery(agentId),
		enabled: !isNewAgent,
	});

	const latestVersion = versions?.[0]; // Versions are ordered by created_at desc

	// Create mutation (creates both agent and first version)
	const createMutation = useMutation({
		mutationFn: async (values: {
			provider: { id: string; model: string };
			messages: MessageT[];
		}) => {
			const newAgentId = nanoid();
			const newVersionId = nanoid();

			// Create agent
			const { error: agentError } = await supabase.from("agents").insert({
				id: newAgentId,
				name: "",
				workspace_id: workspaceId,
			});

			if (agentError) throw agentError;

			// Create first version
			const { error: versionError } = await supabase.from("versions").insert({
				id: newVersionId,
				agent_id: newAgentId,
				provider_id: values.provider.id,
				data: {
					model: values.provider.model,
					messages: values.messages,
				} as unknown as Json,
				is_deployed: false,
			});

			if (versionError) throw versionError;

			return newAgentId;
		},
		onSuccess: (newAgentId) => {
			queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
			toast.success("Agent created successfully");
			navigate({
				to: "/workspace/$workspaceId/agents/$agentId",
				params: { workspaceId, agentId: newAgentId },
			});
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to create agent",
			);
		},
	});

	// Update mutation (creates new version)
	const updateMutation = useMutation({
		mutationFn: async (values: {
			provider: {
				id: string;
				model: string;
			};
			messages: MessageT[];
		}) => {
			const newVersionId = nanoid();

			// Create new version
			const { error: versionError } = await supabase.from("versions").insert({
				id: newVersionId,
				agent_id: agentId,
				provider_id: values.provider.id,
				data: {
					model: values.provider.model,
					messages: values.messages,
				} as unknown as Json,
				is_deployed: false,
			});

			if (versionError) throw versionError;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
			queryClient.invalidateQueries({ queryKey: ["agent-versions", agentId] });
			queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
			toast.success("New version created successfully");
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to create new version",
			);
		},
	});

	// Initialize TanStack Form
	const form = useForm({
		defaultValues: {
			provider: {
				id: latestVersion?.provider_id || "",
				model: (latestVersion?.data as { model?: string } | null)?.model || "",
			},
			messages: (latestVersion?.data as { messages?: MessageT[] } | null)
				?.messages || [
				{
					role: "system",
					content: "",
				},
				{
					role: "user",
					content: [
						{
							type: "text",
							text: "",
						},
					],
				},
			],
		},
		validators: {
			onChange: agentFormSchema,
		},
		onSubmit: async ({ value }) => {
			if (isNewAgent) {
				await createMutation.mutateAsync(value);
			} else {
				await updateMutation.mutateAsync(value);
			}
		},
	});

	const isLoading =
		createMutation.isPending ||
		updateMutation.isPending ||
		isLoadingProviders ||
		isLoadingVersions;

	return (
		<form
			className="flex flex-col h-screen"
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
		>
			<div className="mt-px w-full flex items-center justify-between p-4 h-16 border-b border-default-200 flex-shrink-0">
				<p>Name</p>

				<div className="flex items-center gap-2">
					<form.Subscribe
						selector={(state) => ({
							canSubmit: state.canSubmit,
							isSubmitting: state.isSubmitting,
						})}
					>
						{(state) => (
							<Button
								type="submit"
								color="primary"
								isLoading={isLoading || state.isSubmitting}
								isDisabled={!state.canSubmit || isLoading}
							>
								{isNewAgent ? "Create Agent" : "Save New Version"}
							</Button>
						)}
					</form.Subscribe>
				</div>
			</div>
			<div className="flex flex-1 overflow-hidden">
				<div className="flex-1 flex flex-col border-r border-default-200 min-h-0">
					<div className="flex-1 overflow-y-auto p-4 space-y-4">
						<form.Field name="provider">
							{(field) => (
								<ProviderSelector
									value={field.state.value}
									onChange={field.handleChange}
									providers={providers || []}
									isInvalid={field.state.meta.errors.length > 0}
								/>
							)}
						</form.Field>

						<form.Field name="messages" mode="array">
							{(field) => (
								<Messages
									value={field.state.value}
									onValueChange={field.handleChange}
								/>
							)}
						</form.Field>
					</div>
					<div className="flex justify-end p-4 border-t border-default-200">
						<Button color="secondary" type="button">
							Generate
						</Button>
					</div>
				</div>

				<div className="flex-1 p-4 overflow-y-auto">
					<Messages
						value={generatedMessages}
						onValueChange={setGeneratedMessages}
					/>
				</div>
			</div>
		</form>
	);
}
