import {
	Avatar,
	Button,
	Chip,
	Description,
	Label,
	ListBox,
	Popover,
	useOverlayState,
} from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { LucideHistory } from "lucide-react";
import { type AgentVersionSummary, membersQuery } from "@/lib/queries";

interface VersionHistoryProps {
	workspaceId: string;
	versions: AgentVersionSummary[];
	stagingVersionId?: string | null;
	productionVersionId?: string | null;
	currentVersionId?: string;
	isDirty?: boolean;
	onSelectionChange: (version: AgentVersionSummary) => void;
}

export const VersionHistory = ({
	workspaceId,
	versions,
	stagingVersionId,
	productionVersionId,
	currentVersionId,
	isDirty,
	onSelectionChange,
}: VersionHistoryProps) => {
	const state = useOverlayState();
	const { data: members } = useQuery(membersQuery(workspaceId));

	const versionLabel = isDirty
		? "Unsaved"
		: currentVersionId
			? `#${currentVersionId.slice(0, 7)}`
			: undefined;

	return (
		<Popover isOpen={state.isOpen} onOpenChange={state.setOpen}>
			<Button size="sm" variant="tertiary">
				<LucideHistory className="size-3.5" />
				{versionLabel && (
					<span className="text-xs text-muted">{versionLabel}</span>
				)}
			</Button>
			<Popover.Content placement="bottom end" className="max-w-[350px]">
				<Popover.Dialog className="max-h-96 overflow-auto">
					<ListBox aria-label="Version History" className="p-0">
						{versions.map((version) => {
							const user = members?.find(
								(member) => member.user_id === version.user_id,
							)?.user;

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
									className="flex items-center justify-between gap-8"
								>
									<div className="flex gap-2">
										<Avatar size="sm" className="shrink-0">
											<Avatar.Image
												src={`https://api.dicebear.com/9.x/initials/svg?seed=${user?.name}`}
												alt={user?.name ?? ""}
											/>
											<Avatar.Fallback>
												{user?.name?.slice(0, 1)}
											</Avatar.Fallback>
										</Avatar>
										<div className="flex flex-col">
											<Label>{version.id}</Label>
											<Description>
												{`${format(version.created_at, "d LLL, hh:mm a")} by ${user?.name}`}
											</Description>
										</div>
									</div>
									<div className="flex gap-1">
										{isStaging && (
											<Chip size="sm" color="warning" variant="primary">
												S
											</Chip>
										)}
										{isProduction && (
											<Chip size="sm" color="success" variant="primary">
												P
											</Chip>
										)}
									</div>
								</ListBox.Item>
							);
						})}
					</ListBox>
				</Popover.Dialog>
			</Popover.Content>
		</Popover>
	);
};
