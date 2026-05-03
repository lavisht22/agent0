import {
	Button,
	Description,
	FieldError,
	Input,
	InputGroup,
	Label,
	Modal,
	Spinner,
	TextField,
	toast,
} from "@heroui/react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Copy, Plus, X } from "lucide-react";
import { customAlphabet, nanoid } from "nanoid";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { agentsQuery } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute(
	"/_app/workspace/$workspaceId/api-keys/new",
)({
	component: RouteComponent,
});

// Built-in suggestions for the scope field. Users can also type free-form
// values (e.g. "agents:run:<agentId>") since the format is just three
// colon-separated segments on the server.
const BUILT_IN_SCOPE_SUGGESTIONS = [
	"*:*:*",
	"agents:run:*",
	"agents:read:*",
	"runs:read:*",
	"embeddings:run:*",
];

function RouteComponent() {
	const { workspaceId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [createdKey, setCreatedKey] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	// Fetch agents so we can suggest per-agent scopes alongside the wildcards.
	const { data: agents } = useQuery(agentsQuery(workspaceId));

	const agentScopeSuggestions =
		agents?.flatMap((a) => [
			`agents:run:${a.id}`,
			`agents:read:${a.id}`,
		]) ?? [];

	const allScopeSuggestions = [
		...BUILT_IN_SCOPE_SUGGESTIONS,
		...agentScopeSuggestions,
	];

	// Create mutation
	const createMutation = useMutation({
		mutationFn: async (values: {
			name: string;
			scopes: string[];
			allowedOrigins: string[];
		}) => {
			const {
				data: { user },
			} = await supabase.auth.getUser();

			if (!user) throw new Error("User not authenticated");

			const key = customAlphabet("abcdefghijklmnopqrstuvwxyz1234567890")();

			// Drop blanks; allow empty origin list (= unrestricted).
			const cleanScopes = values.scopes
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			const cleanOrigins = values.allowedOrigins
				.map((o) => o.trim())
				.filter((o) => o.length > 0);

			const { error } = await supabase
				.from("api_keys")
				.insert({
					id: nanoid(),
					key,
					name: values.name,
					workspace_id: workspaceId,
					user_id: user.id,
					scopes: cleanScopes,
					// null = no origin restriction; non-null = enforce allowlist
					allowed_origins: cleanOrigins.length > 0 ? cleanOrigins : null,
				})
				.select()
				.single();

			if (error) throw error;

			return key;
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["api-keys", workspaceId] });
			setCreatedKey(data);
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to create API key.",
			);
		},
	});

	// Initialize TanStack Form
	const form = useForm({
		defaultValues: {
			name: "",
			// Default to full access so the create flow is one-click for the
			// common case. Users narrow it down by removing/replacing entries.
			scopes: ["*:*:*"] as string[],
			allowedOrigins: [] as string[],
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
			toast.success("API key copied to clipboard");
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.danger("Failed to copy API key");
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
			<Modal>
				<Modal.Backdrop isOpen={true} isDismissable={false}>
					<Modal.Container>
						<Modal.Dialog>
							<Modal.Header>
								<Modal.Heading>API Key Created</Modal.Heading>
							</Modal.Header>
							<Modal.Body>
								<div className="space-y-4">
									<div>
										<p className="text-sm text-muted mb-2">
											Keep it safe. This API Key can be used to call the run API
											for your workspace.
										</p>
										<InputGroup>
											<InputGroup.Input value={createdKey} readOnly />
											<InputGroup.Suffix>
												<Button
													variant="tertiary"
													onPress={handleCopy}
													isIconOnly
												>
													{copied ? (
														<Check className="size-4" />
													) : (
														<Copy className="size-4" />
													)}
												</Button>
											</InputGroup.Suffix>
										</InputGroup>
									</div>
								</div>
							</Modal.Body>
							<Modal.Footer>
								<Button variant="primary" onPress={handleDone}>
									Done
								</Button>
							</Modal.Footer>
						</Modal.Dialog>
					</Modal.Container>
				</Modal.Backdrop>
			</Modal>
		);
	}

	return (
		<div className="h-screen flex flex-col">
			<PageHeader
				breadcrumbs={[
					{
						label: "API Keys",
						to: "/workspace/$workspaceId/api-keys",
						params: { workspaceId },
					},
					{ label: "Create" },
				]}
			/>

			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-4xl mx-auto space-y-6">
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
								<TextField
									name="name"
									isRequired
									isInvalid={field.state.meta.errors.length > 0}
								>
									<Label>Name</Label>
									<Input
										placeholder="e.g., Production API Key"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
									<Description>
										A friendly name to identify this API key
									</Description>
									{field.state.meta.errors.length > 0 && (
										<FieldError>{field.state.meta.errors[0]}</FieldError>
									)}
								</TextField>
							)}
						</form.Field>

						{/* Scopes */}
						<form.Field name="scopes" mode="array">
							{(field) => {
								const usedSuggestions = new Set(field.state.value);
								const remainingSuggestions = allScopeSuggestions.filter(
									(s) => !usedSuggestions.has(s),
								);
								return (
									<div className="mt-6 space-y-2">
										<Label>Scopes</Label>
										<Description>
											Each scope is <code>entity:operation:target</code>. Use{" "}
											<code>*</code> as a wildcard for any segment.{" "}
											<code>*:*:*</code> grants full access. An empty list means
											the key can do nothing.
										</Description>
										<div className="space-y-2">
											{field.state.value.map((scope, i) => (
												// biome-ignore lint/suspicious/noArrayIndexKey: order-stable, simple list
												<div key={i} className="flex gap-2 items-center">
													<Input
														className="flex-1 font-mono text-sm"
														placeholder="entity:operation:target"
														value={scope}
														onChange={(e) => {
															const next = [...field.state.value];
															next[i] = e.target.value;
															field.handleChange(next);
														}}
													/>
													<Button
														variant="tertiary"
														isIconOnly
														onPress={() => {
															const next = field.state.value.filter(
																(_, idx) => idx !== i,
															);
															field.handleChange(next);
														}}
													>
														<X className="size-4" />
													</Button>
												</div>
											))}
										</div>
										<Button
											variant="tertiary"
											onPress={() => {
												field.handleChange([...field.state.value, ""]);
											}}
										>
											<Plus className="size-4" /> Add scope
										</Button>

										{remainingSuggestions.length > 0 && (
											<div className="mt-3">
												<p className="text-xs text-muted mb-2">Suggestions</p>
												<div className="flex flex-wrap gap-2">
													{remainingSuggestions.slice(0, 12).map((s) => (
														<button
															type="button"
															key={s}
															onClick={() => {
																// Replace a trailing blank if there is one,
																// otherwise append.
																const current = field.state.value;
																const lastIdx = current.length - 1;
																if (
																	current.length > 0 &&
																	current[lastIdx].trim() === ""
																) {
																	const next = [...current];
																	next[lastIdx] = s;
																	field.handleChange(next);
																} else {
																	field.handleChange([...current, s]);
																}
															}}
															className="text-xs font-mono px-2 py-1 rounded border border-border hover:bg-muted/50"
														>
															+ {s}
														</button>
													))}
												</div>
											</div>
										)}
									</div>
								);
							}}
						</form.Field>

						{/* Allowed Origins */}
						<form.Field name="allowedOrigins" mode="array">
							{(field) => (
								<div className="mt-6 space-y-2">
									<Label>Allowed Origins</Label>
									<Description>
										Optional. If set, the request <code>Origin</code> header
										must match one of these values. Leave empty to allow any
										origin (server-to-server default). Soft control — easily
										spoofed by non-browser callers.
									</Description>
									<div className="space-y-2">
										{field.state.value.map((origin, i) => (
											// biome-ignore lint/suspicious/noArrayIndexKey: order-stable, simple list
											<div key={i} className="flex gap-2 items-center">
												<Input
													className="flex-1 font-mono text-sm"
													placeholder="https://example.com"
													value={origin}
													onChange={(e) => {
														const next = [...field.state.value];
														next[i] = e.target.value;
														field.handleChange(next);
													}}
												/>
												<Button
													variant="tertiary"
													isIconOnly
													onPress={() => {
														const next = field.state.value.filter(
															(_, idx) => idx !== i,
														);
														field.handleChange(next);
													}}
												>
													<X className="size-4" />
												</Button>
											</div>
										))}
									</div>
									<Button
										variant="tertiary"
										onPress={() => {
											field.handleChange([...field.state.value, ""]);
										}}
									>
										<Plus className="size-4" /> Add origin
									</Button>
								</div>
							)}
						</form.Field>

						<div className="flex justify-end gap-3 mt-6">
							<Button
								variant="tertiary"
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
										variant="primary"
										isPending={isLoading || state.isSubmitting}
										isDisabled={!state.canSubmit || isLoading}
									>
										{({ isPending }) => (
											<>
												{isPending && <Spinner color="current" size="sm" />}
												Create
											</>
										)}
									</Button>
								)}
							</form.Subscribe>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
}
