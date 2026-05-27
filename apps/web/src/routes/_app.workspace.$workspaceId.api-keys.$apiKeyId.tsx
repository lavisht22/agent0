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
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { apiKeysQuery } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute(
	"/_app/workspace/$workspaceId/api-keys/$apiKeyId",
)({
	component: RouteComponent,
});

const BUILT_IN_SCOPE_SUGGESTIONS = [
	"*:*:*",
	"agents:run:*",
	"agents:read:*",
	"runs:read:*",
	"embeddings:run:*",
	"tags:read:*",
	"providers:read:*",
	"mcps:read:*",
];




interface FormValues {
	name: string;
	scopes: string[];
	allowedOrigins: string[];
}

function RouteComponent() {
	const { workspaceId, apiKeyId } = Route.useParams();
	const isNew = apiKeyId === "new";
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const [createdKey, setCreatedKey] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const { data: apiKeys, isLoading: isLoadingKeys } = useQuery({
		...apiKeysQuery(workspaceId),
		enabled: !isNew,
	});
	const currentKey = useMemo(
		() => apiKeys?.find((k) => k.id === apiKeyId),
		[apiKeys, apiKeyId],
	);

	const createMutation = useMutation({
		mutationFn: async (values: FormValues) => {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) throw new Error("User not authenticated");

			const key = customAlphabet("abcdefghijklmnopqrstuvwxyz1234567890")();

			const { error } = await supabase
				.from("api_keys")
				.insert({
					id: nanoid(),
					key,
					name: values.name,
					workspace_id: workspaceId,
					user_id: user.id,
					scopes: values.scopes,
					allowed_origins:
						values.allowedOrigins.length > 0 ? values.allowedOrigins : null,
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

	const updateMutation = useMutation({
		mutationFn: async (values: FormValues) => {
			const { error } = await supabase
				.from("api_keys")
				.update({
					name: values.name,
					scopes: values.scopes,
					allowed_origins:
						values.allowedOrigins.length > 0 ? values.allowedOrigins : null,
				})
				.eq("id", apiKeyId);

			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["api-keys", workspaceId] });
			toast.success("API key updated successfully.");
			navigate({
				to: "/workspace/$workspaceId/api-keys",
				params: { workspaceId },
			});
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to update API key.",
			);
		},
	});

	const form = useForm({
		defaultValues: {
			name: currentKey?.name ?? "",
			scopes: currentKey?.scopes ?? (isNew ? ["*:*:*"] : []),
			allowedOrigins: currentKey?.allowed_origins ?? [],
		} as FormValues,
		onSubmit: async ({ value }) => {
			const cleaned: FormValues = {
				name: value.name,
				scopes: value.scopes.map((s) => s.trim()).filter(Boolean),
				allowedOrigins: value.allowedOrigins
					.map((o) => o.trim())
					.filter(Boolean),
			};
			if (isNew) {
				await createMutation.mutateAsync(cleaned);
			} else {
				await updateMutation.mutateAsync(cleaned);
			}
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

	const isLoading = createMutation.isPending || updateMutation.isPending;

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
									<p className="text-sm text-muted">
										Keep it safe. This key will not be shown again.
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

	if (!isNew && isLoadingKeys) {
		return (
			<div className="h-screen flex flex-col">
				<PageHeader
					breadcrumbs={[
						{
							label: "API Keys",
							to: "/workspace/$workspaceId/api-keys",
							params: { workspaceId },
						},
						{ label: "Edit" },
					]}
				/>
				<div className="flex-1 flex items-center justify-center">
					<Spinner />
				</div>
			</div>
		);
	}

	if (!isNew && !currentKey) {
		return (
			<div className="h-screen flex flex-col">
				<PageHeader
					breadcrumbs={[
						{
							label: "API Keys",
							to: "/workspace/$workspaceId/api-keys",
							params: { workspaceId },
						},
						{ label: "Edit" },
					]}
				/>
				<div className="flex-1 flex items-center justify-center">
					<p className="text-sm text-muted">API key not found.</p>
				</div>
			</div>
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
					{ label: isNew ? "New" : currentKey?.name || "Edit" },
				]}
			/>

			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-2xl mx-auto">
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}
						className="space-y-6"
					>
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
										A friendly name to identify this API key.
									</Description>
									{field.state.meta.errors.length > 0 && (
										<FieldError>{field.state.meta.errors[0]}</FieldError>
									)}
								</TextField>
							)}
						</form.Field>

						<form.Field name="scopes" mode="array">
							{(field) => {
								const usedSuggestions = new Set(field.state.value);
								const remainingSuggestions = BUILT_IN_SCOPE_SUGGESTIONS.filter(
									(s) => !usedSuggestions.has(s),
								);
								return (
									<ScopeListField
										label="Scopes"
										description={
											<>
												Each scope is{" "}
												<code className="font-mono text-xs">
													entity:operation:target
												</code>
												. Use <code className="font-mono text-xs">*</code> as a
												wildcard for any segment.{" "}
												<code className="font-mono text-xs">*:*:*</code> grants
												full access. An empty list means the key can do
												nothing.
											</>
										}
										placeholder="entity:operation:target"
										values={field.state.value}
										onChange={field.handleChange}
										suggestions={remainingSuggestions}
									/>
								);
							}}
						</form.Field>

						<form.Field name="allowedOrigins" mode="array">
							{(field) => (
								<ScopeListField
									label="Allowed Origins"
									description={
										<>
											Optional. If set, the request{" "}
											<code className="font-mono text-xs">Origin</code> header
											must match one of these values. Leave empty to allow any
											origin (server-to-server default). Soft control — easily
											spoofed by non-browser callers.
										</>
									}
									placeholder="https://example.com"
									values={field.state.value}
									onChange={field.handleChange}
								/>
							)}
						</form.Field>

						<div className="flex justify-end gap-3 pt-2">
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
												{isNew ? "Create" : "Save"}
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

interface ScopeListFieldProps {
	label: string;
	description: React.ReactNode;
	placeholder: string;
	values: string[];
	onChange: (next: string[]) => void;
	suggestions?: string[];
}

function ScopeListField({
	label,
	description,
	placeholder,
	values,
	onChange,
	suggestions,
}: ScopeListFieldProps) {
	const handleChangeAt = (i: number, value: string) => {
		// Editing the trailing empty input — append as a new entry.
		if (i === values.length) {
			onChange([...values, value]);
			return;
		}
		const next = [...values];
		next[i] = value;
		onChange(next);
	};

	const removeAt = (i: number) => {
		onChange(values.filter((_, idx) => idx !== i));
	};

	const appendValue = (value: string) => {
		if (values.includes(value)) return;
		onChange([...values, value]);
	};

	// Always render an extra empty input at the bottom for the next entry.
	const rows = [...values, ""];

	return (
		<div className="flex flex-col gap-2">
			<Label>{label}</Label>

			<div className="flex flex-col gap-2">
				{rows.map((value, i) => {
					const isExtra = i === values.length;
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: index-keyed by design — preserves focus on the trailing input as new rows are appended
						<div key={i} className="flex gap-2 items-start">
							<TextField
								className="flex-1"
								value={value}
								onChange={(v) => handleChangeAt(i, v)}
								aria-label={`${label} ${i + 1}`}
							>
								<Input
									placeholder={placeholder}
									className="font-mono text-sm"
								/>
							</TextField>
							<Button
								variant="tertiary"
								isIconOnly
								onPress={() => removeAt(i)}
								isDisabled={isExtra}
								aria-label="Remove"
							>
								<X className="size-4" />
							</Button>
						</div>
					);
				})}
			</div>

			<Description>{description}</Description>

			{suggestions && suggestions.length > 0 && (
				<div className="flex flex-col gap-2 pt-1">
					<p className="text-xs text-muted">Suggestions</p>
					<div className="flex flex-wrap gap-2">
						{suggestions.map((s) => (
							<Button
								key={s}
								size="sm"
								variant="tertiary"
								onPress={() => appendValue(s)}
							>
								<Plus className="size-4" />
								<span className="font-mono">{s}</span>
							</Button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
