import {
	Button,
	Dropdown,
	Label,
	Table,
	toast,
	useOverlayState,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { LucideEllipsisVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { PageHeader } from "@/components/page-header";
import {
	personalAccessTokensQuery,
	revokePersonalAccessToken,
} from "@/lib/queries";

export const Route = createFileRoute("/_app/account/personal-access-tokens/")({
	component: RouteComponent,
});

function RouteComponent() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const revokeState = useOverlayState();
	const [tokenToRevoke, setTokenToRevoke] = useState<{
		id: string;
		name: string;
	} | null>(null);

	const { data: tokens, isLoading } = useQuery(personalAccessTokensQuery);

	const revokeMutation = useMutation({
		mutationFn: (tokenId: string) => revokePersonalAccessToken(tokenId),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["personal-access-tokens"],
			});
			toast.success("Token revoked.");
			revokeState.close();
			setTokenToRevoke(null);
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to revoke token.",
			);
		},
	});

	return (
		<div className="h-screen overflow-hidden flex flex-col">
			<PageHeader
				breadcrumbs={[
					{ label: "Account", to: "/" },
					{ label: "Personal Access Tokens" },
				]}
			>
				<Button
					variant="primary"
					onPress={() =>
						navigate({
							to: "/account/personal-access-tokens/$tokenId",
							params: { tokenId: "new" },
						})
					}
				>
					<Plus size={18} />
					Generate
				</Button>
			</PageHeader>

			<div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
				<p className="text-sm text-muted">
					Personal tokens authenticate the agent0 CLI as you. They inherit your
					current role in whichever workspace the CLI targets, so removing your
					access to a workspace revokes these tokens there. Each token is shown
					exactly once at generation — store it somewhere safe.
				</p>
				<Table className="flex-1 overflow-hidden">
					<Table.ScrollContainer className="flex-1 overflow-y-auto">
						<Table.Content aria-label="Personal Access Tokens Table">
							<Table.Header className="sticky top-0 z-10">
								<Table.Column>Name</Table.Column>
								<Table.Column>Prefix</Table.Column>
								<Table.Column>Created</Table.Column>
								<Table.Column>Last used</Table.Column>
								<Table.Column>Expires</Table.Column>
								<Table.Column className="w-20"></Table.Column>
							</Table.Header>
							<Table.Body
								items={tokens || []}
								renderEmptyState={() =>
									isLoading ? (
										<p className="text-center text-muted p-6">Loading...</p>
									) : (
										<p className="text-center text-muted p-6">
											No active tokens. Generate one to use the agent0 CLI.
										</p>
									)
								}
							>
								{(item) => (
									<Table.Row key={item.id} id={item.id}>
										<Table.Cell>{item.name}</Table.Cell>
										<Table.Cell>
											<code className="font-mono text-xs">
												{item.token_prefix}…
											</code>
										</Table.Cell>
										<Table.Cell>
											{format(item.created_at, "d LLL, hh:mm a")}
										</Table.Cell>
										<Table.Cell>
											{item.last_used_at
												? format(item.last_used_at, "d LLL, hh:mm a")
												: "—"}
										</Table.Cell>
										<Table.Cell>
											{item.expires_at
												? format(item.expires_at, "d LLL yyyy")
												: "Never"}
										</Table.Cell>
										<Table.Cell className="flex justify-end">
											<Dropdown>
												<Button isIconOnly variant="ghost">
													<LucideEllipsisVertical className="size-4" />
												</Button>
												<Dropdown.Popover>
													<Dropdown.Menu>
														<Dropdown.Item
															id="revoke"
															textValue="Revoke"
															variant="danger"
															onAction={() => {
																setTokenToRevoke({
																	id: item.id,
																	name: item.name,
																});
																revokeState.open();
															}}
														>
															<Trash2 className="size-4 text-danger" />
															<Label>Revoke</Label>
														</Dropdown.Item>
													</Dropdown.Menu>
												</Dropdown.Popover>
											</Dropdown>
										</Table.Cell>
									</Table.Row>
								)}
							</Table.Body>
						</Table.Content>
					</Table.ScrollContainer>
				</Table>
			</div>

			<ConfirmationModal
				isOpen={revokeState.isOpen}
				onOpenChange={revokeState.setOpen}
				title="Revoke Token"
				description={`Revoke "${tokenToRevoke?.name}"? Any CLI session using it will be signed out on the next request.`}
				onConfirm={() => {
					if (tokenToRevoke) {
						revokeMutation.mutate(tokenToRevoke.id);
					}
				}}
				isLoading={revokeMutation.isPending}
				confirmText="Revoke"
				confirmColor="danger"
			/>
		</div>
	);
}
