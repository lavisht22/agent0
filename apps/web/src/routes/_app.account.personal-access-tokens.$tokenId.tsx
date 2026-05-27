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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import { customAlphabet, nanoid } from "nanoid";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute(
	"/_app/account/personal-access-tokens/$tokenId",
)({
	component: RouteComponent,
});

interface FormValues {
	name: string;
}

// URL-safe alphabet — no `+`, `/`, or `=` so the token is shell- and
// query-string-safe without quoting.
const tokenRandom = customAlphabet(
	"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
	32,
);

const TOKEN_PREFIX = "agent0_pat_";
// Length of the prefix the dashboard stores for display: the static prefix
// plus four random chars, enough to differentiate tokens visually.
const PREFIX_DISPLAY_LEN = TOKEN_PREFIX.length + 4;

async function sha256Hex(input: string): Promise<string> {
	const buffer = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(input),
	);
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function RouteComponent() {
	const { tokenId } = Route.useParams();
	const isNew = tokenId === "new";
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const [createdToken, setCreatedToken] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const createMutation = useMutation({
		mutationFn: async (values: FormValues) => {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) throw new Error("User not authenticated");

			const token = `${TOKEN_PREFIX}${tokenRandom()}`;
			const tokenHash = await sha256Hex(token);

			const { error } = await supabase
				.from("personal_access_tokens")
				.insert({
					id: nanoid(),
					user_id: user.id,
					token_hash: tokenHash,
					token_prefix: token.slice(0, PREFIX_DISPLAY_LEN),
					name: values.name,
				})
				.select()
				.single();

			if (error) throw error;
			return token;
		},
		onSuccess: (token) => {
			queryClient.invalidateQueries({
				queryKey: ["personal-access-tokens"],
			});
			setCreatedToken(token);
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to generate token.",
			);
		},
	});

	const form = useForm({
		defaultValues: { name: "" } as FormValues,
		onSubmit: async ({ value }) => {
			await createMutation.mutateAsync({ name: value.name.trim() });
		},
	});

	const handleCopy = async () => {
		if (!createdToken) return;
		try {
			await navigator.clipboard.writeText(createdToken);
			setCopied(true);
			toast.success("Token copied to clipboard");
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.danger("Failed to copy token");
		}
	};

	const handleDone = () => {
		navigate({ to: "/account/personal-access-tokens" });
	};

	if (!isNew) {
		// PATs are not editable. Bounce back to the list.
		return (
			<div className="h-screen flex flex-col">
				<PageHeader
					breadcrumbs={[
						{ label: "Account", to: "/" },
						{
							label: "Personal Access Tokens",
							to: "/account/personal-access-tokens",
						},
					]}
				/>
				<div className="flex-1 flex items-center justify-center">
					<p className="text-sm text-muted">
						Personal access tokens can't be edited — revoke and generate a new
						one instead.
					</p>
				</div>
			</div>
		);
	}

	if (createdToken) {
		return (
			<Modal>
				<Modal.Backdrop isOpen={true} isDismissable={false}>
					<Modal.Container>
						<Modal.Dialog>
							<Modal.Header>
								<Modal.Heading>Token Generated</Modal.Heading>
							</Modal.Header>
							<Modal.Body>
								<div className="space-y-4">
									<p className="text-sm text-muted">
										Copy your token now. It will not be shown again.
									</p>
									<InputGroup variant="secondary" fullWidth>
										<InputGroup.Input value={createdToken} readOnly />
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
									<p className="text-xs text-muted">
										Paste it into the agent0 CLI when prompted by{" "}
										<code className="font-mono">agent0 login</code>.
									</p>
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

	const isLoading = createMutation.isPending;

	return (
		<div className="h-screen flex flex-col">
			<PageHeader
				breadcrumbs={[
					{ label: "Account", to: "/" },
					{
						label: "Personal Access Tokens",
						to: "/account/personal-access-tokens",
					},
					{ label: "New" },
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
										? "Token name is required"
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
										placeholder="e.g., laptop CLI"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
									<Description>
										Something to help you recognise this token in the list.
									</Description>
									{field.state.meta.errors.length > 0 && (
										<FieldError>{field.state.meta.errors[0]}</FieldError>
									)}
								</TextField>
							)}
						</form.Field>

						<div className="flex justify-end gap-3 pt-2">
							<Button
								variant="tertiary"
								onPress={() =>
									navigate({ to: "/account/personal-access-tokens" })
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
												Generate
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
