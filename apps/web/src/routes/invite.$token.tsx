import { Button, Spinner, toast } from "@heroui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, MailWarning } from "lucide-react";
import {
	authClient,
	getCachedSession,
	invalidateSession,
} from "../lib/auth-client";
import { acceptInvitation, invitationQuery } from "../lib/queries";

export const Route = createFileRoute("/invite/$token")({
	component: RouteComponent,
	beforeLoad: async ({ params }) => {
		// Accepting binds the invite to a signed-in identity, so require auth first
		// and bounce back here after login.
		const session = await getCachedSession();
		if (!session) {
			throw redirect({
				to: "/auth",
				search: { redirect: `/invite/${params.token}` },
			});
		}
	},
});

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen flex flex-col items-center justify-center p-4">
			<div className="w-full max-w-sm space-y-6 text-center">{children}</div>
		</div>
	);
}

function RouteComponent() {
	const { token } = Route.useParams();
	const navigate = useNavigate();

	const {
		data: invitation,
		isLoading,
		isError,
		error,
	} = useQuery(invitationQuery(token));

	const acceptMutation = useMutation({
		mutationFn: () => acceptInvitation(token),
		onSuccess: ({ workspace_id }) => {
			localStorage.setItem("lastAccessedWorkspace", workspace_id);
			toast.success("Invitation accepted.");
			navigate({
				to: "/workspace/$workspaceId",
				params: { workspaceId: workspace_id },
			});
		},
		onError: (err) => {
			toast.danger(err.message);
		},
	});

	const switchAccount = async () => {
		await authClient.signOut();
		invalidateSession();
		navigate({ to: "/auth", search: { redirect: `/invite/${token}` } });
	};

	if (isLoading) {
		return (
			<Shell>
				<Spinner />
			</Shell>
		);
	}

	if (isError || !invitation) {
		return (
			<Shell>
				<MailWarning className="size-10 mx-auto text-muted" />
				<div className="space-y-1">
					<h1 className="text-2xl font-medium tracking-tight">
						Invitation not found
					</h1>
					<p className="text-muted">
						{error instanceof Error
							? error.message
							: "This invitation link is invalid."}
					</p>
				</div>
				<Button variant="tertiary" onPress={() => navigate({ to: "/" })}>
					Go to agent0
				</Button>
			</Shell>
		);
	}

	if (invitation.status === "accepted") {
		return (
			<Shell>
				<CheckCircle2 className="size-10 mx-auto text-success" />
				<div className="space-y-1">
					<h1 className="text-2xl font-medium tracking-tight">
						Invitation already accepted
					</h1>
					<p className="text-muted">
						You've already joined {invitation.workspace_name}.
					</p>
				</div>
				<Button
					variant="primary"
					onPress={() =>
						navigate({
							to: "/workspace/$workspaceId",
							params: { workspaceId: invitation.workspace_id },
						})
					}
				>
					Go to workspace
				</Button>
			</Shell>
		);
	}

	if (invitation.status === "revoked" || invitation.status === "expired") {
		return (
			<Shell>
				<MailWarning className="size-10 mx-auto text-muted" />
				<div className="space-y-1">
					<h1 className="text-2xl font-medium tracking-tight">
						Invitation {invitation.status}
					</h1>
					<p className="text-muted">
						This invitation to {invitation.workspace_name} is no longer valid.
						Ask an admin to send a new one.
					</p>
				</div>
				<Button variant="tertiary" onPress={() => navigate({ to: "/" })}>
					Go to agent0
				</Button>
			</Shell>
		);
	}

	// status === "pending"
	if (!invitation.email_matches) {
		return (
			<Shell>
				<MailWarning className="size-10 mx-auto text-warning" />
				<div className="space-y-1">
					<h1 className="text-2xl font-medium tracking-tight">Wrong account</h1>
					<p className="text-muted">
						This invitation was sent to{" "}
						<span className="font-medium">{invitation.email}</span>. Sign in
						with that email to accept it.
					</p>
				</div>
				<Button variant="primary" onPress={switchAccount}>
					Sign in with a different account
				</Button>
			</Shell>
		);
	}

	return (
		<Shell>
			<div className="space-y-2">
				<h1 className="text-3xl font-medium tracking-tight">
					Join {invitation.workspace_name}
				</h1>
				<p className="text-muted">
					You've been invited to join{" "}
					<span className="font-medium">{invitation.workspace_name}</span> as a{" "}
					<span className="capitalize">{invitation.role}</span>.
				</p>
			</div>
			<Button
				variant="primary"
				size="lg"
				className="w-full"
				isPending={acceptMutation.isPending}
				onPress={() => acceptMutation.mutate()}
			>
				{({ isPending }) => (
					<>
						{isPending && <Spinner color="current" size="sm" />}
						Accept invitation
					</>
				)}
			</Button>
		</Shell>
	);
}
