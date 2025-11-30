import {
	addToast,
	Button,
	Input,
	Modal,
	ModalBody,
	ModalContent,
	ModalFooter,
	ModalHeader,
} from "@heroui/react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { customAlphabet } from "nanoid";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute(
	"/_app/workspace/$workspaceId/api-keys/new",
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { workspaceId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [createdKey, setCreatedKey] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	// Create mutation
	const createMutation = useMutation({
		mutationFn: async (values: { name: string }) => {
			// Generate a secure API key
			const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz1234567890");
			const id = nanoid();

			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) throw new Error("User not authenticated");

			// In production, you would hash the key before storing
			// For now, we're storing the full key ID (this should be hashed)
			const { error } = await supabase
				.from("api_keys")
				.insert({
					id,
					name: values.name,
					workspace_id: workspaceId,
					user_id: user.id,
				})
				.select()
				.single();

			if (error) throw error;

			return id;
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["api-keys", workspaceId] });
			setCreatedKey(data);
		},
		onError: (error) => {
			addToast({
				description:
					error instanceof Error ? error.message : "Failed to create API key.",
				color: "danger",
			});
		},
	});

	// Initialize TanStack Form
	const form = useForm({
		defaultValues: {
			name: "",
		},
		onSubmit: async ({ value }) => {
			await createMutation.mutateAsync(value);
		},
	});

	const handleCopy = async () => {
		if (!createdKey) return;
		try {
			await navigator.clipboard.writeText(createdKey);
			setCopied(true);
			addToast({
				description: "API key copied to clipboard",
				color: "success",
			});
			setTimeout(() => setCopied(false), 2000);
		} catch {
			addToast({
				description: "Failed to copy API key",
				color: "danger",
			});
		}
	};

	const handleDone = () => {
		navigate({
			to: "/workspace/$workspaceId/api-keys",
			params: { workspaceId },
		});
	};

	const isLoading = createMutation.isPending;

	// Show success modal with the created key
	if (createdKey) {
		return (
			<Modal
				isOpen={true}
				onClose={handleDone}
				isDismissable={false}
				hideCloseButton
			>
				<ModalContent>
					<ModalHeader className="flex flex-col gap-1">
						API Key Created
					</ModalHeader>
					<ModalBody>
						<div className="space-y-4">
							<div>
								<p className="text-sm text-default-500 mb-2">
									Keep it safe. This API Key can be used to call the run API for
									your workspace.
								</p>
								<Input
									value={createdKey}
									isReadOnly
									endContent={
										<Button variant="light" onPress={handleCopy} isIconOnly>
											{copied ? (
												<Check className="size-4" />
											) : (
												<Copy className="size-4" />
											)}
										</Button>
									}
								/>
							</div>
						</div>
					</ModalBody>
					<ModalFooter>
						<Button color="primary" onPress={handleDone}>
							Done
						</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
		);
	}

	return (
		<div>
			<div className="flex items-center p-2">
				<Button
					variant="light"
					isIconOnly
					onPress={() =>
						navigate({
							to: "..",
						})
					}
				>
					<ArrowLeft className="size-4" />
				</Button>
			</div>

			<div className="p-6 max-w-4xl mx-auto space-y-6">
				<div>
					<h1 className="text-2xl font-medium tracking-tight">
						Create API Key
					</h1>
					<p className="text-default-500">
						Generate a new API key for programmatic access to your workspace
					</p>
				</div>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
				>
					{/* Name Field */}
					<form.Field
						name="name"
						validators={{
							onChange: ({ value }) =>
								!value || value.trim() === ""
									? "API key name is required"
									: undefined,
						}}
					>
						{(field) => (
							<Input
								label="Name"
								placeholder="e.g., Production API Key"
								value={field.state.value}
								onValueChange={field.handleChange}
								isRequired
								variant="bordered"
								description="A friendly name to identify this API key"
								isInvalid={field.state.meta.errors.length > 0}
								errorMessage={field.state.meta.errors[0]}
							/>
						)}
					</form.Field>

					<div className="flex justify-end gap-3 mt-6">
						<Button
							variant="light"
							onPress={() =>
								navigate({
									to: "/workspace/$workspaceId/api-keys",
									params: { workspaceId },
								})
							}
							isDisabled={isLoading}
						>
							Cancel
						</Button>
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
									Create
								</Button>
							)}
						</form.Subscribe>
					</div>
				</form>
			</div>
		</div>
	);
}
