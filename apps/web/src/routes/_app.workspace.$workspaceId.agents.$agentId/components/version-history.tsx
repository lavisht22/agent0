import {
	Avatar,
	Button,
	Chip,
	Description,
	Label,
	ListBox,
	Popover,
	ScrollShadow,
	useOverlayState,
} from "@heroui/react";
import type { Tables } from "@repo/database";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { LucideHistory } from "lucide-react";
import { useMemo } from "react";
import { workspacesQuery } from "@/lib/queries";

interface VersionHistoryProps {
	workspaceId: string;
	versions: Tables<"agent_versions">[];
	stagingVersionId?: string | null;
	productionVersionId?: string | null;
	onSelectionChange: (version: Tables<"agent_versions">) => void;
}

export const VersionHistory = ({
	workspaceId,
	versions,
	stagingVersionId,
	productionVersionId,
	onSelectionChange,
}: VersionHistoryProps) => {
	const state = useOverlayState();
	const { data: workspaces } = useQuery(workspacesQuery);

	const workspace = useMemo(() => {
		return workspaces?.find((workspace) => workspace.id === workspaceId);
	}, [workspaces, workspaceId]);

	return (
		<Popover isOpen={state.isOpen} onOpenChange={state.setOpen}>
			<Button size="sm" variant="tertiary">
				<LucideHistory className="size-3.5" />
			</Button>
			<Popover.Content placement="bottom end">
				<Popover.Dialog className="p-0">
					<ScrollShadow className="max-h-96 p-2">
						<ListBox aria-label="Version History">
							{versions.map((version) => {
								const user = workspace?.workspace_user.find(
									(user) => user.user_id === version.user_id,
								)?.users;

								const isStaging = stagingVersionId === version.id;
								const isProduction = productionVersionId === version.id;

								return (
									<ListBox.Item
										key={version.id}
										id={version.id}
										textValue={version.id}
										onAction={() => {
											onSelectionChange(version);
											state.close();
										}}
									>
										<Avatar size="sm" className="shrink-0">
											<Avatar.Image
												src={`https://api.dicebear.com/9.x/initials/svg?seed=${user?.name}`}
												alt={user?.name ?? ""}
											/>
											<Avatar.Fallback>
												{user?.name?.slice(0, 1)}
											</Avatar.Fallback>
										</Avatar>
										<Label>{version.id}</Label>
										<Description>
											{`${format(version.created_at, "d LLL, hh:mm a")} by ${user?.name}`}
										</Description>
										<div className="flex gap-1">
											{isStaging && (
												<Chip size="sm" variant="tertiary">
													STAGING
												</Chip>
											)}
											{isProduction && (
												<Chip size="sm" variant="tertiary">
													PRODUCTION
												</Chip>
											)}
										</div>
									</ListBox.Item>
								);
							})}
						</ListBox>
					</ScrollShadow>
				</Popover.Dialog>
			</Popover.Content>
		</Popover>
	);
};
