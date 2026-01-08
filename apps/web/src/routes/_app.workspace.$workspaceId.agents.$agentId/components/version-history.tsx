import {
	Avatar,
	Button,
	Chip,
	Listbox,
	ListboxItem,
	Popover,
	PopoverContent,
	PopoverTrigger,
	ScrollShadow,
	useDisclosure,
} from "@heroui/react";
import type { Tables } from "@repo/database";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { LucideHistory } from "lucide-react";
import { useMemo } from "react";
import { workspacesQuery } from "@/lib/queries";

interface VersionHistoryProps {
	workspaceId: string;
	versions: Tables<"versions">[];
	stagingVersionId?: string | null;
	productionVersionId?: string | null;
	onSelectionChange: (version: Tables<"versions">) => void;
}

export const VersionHistory = ({
	workspaceId,
	versions,
	stagingVersionId,
	productionVersionId,
	onSelectionChange,
}: VersionHistoryProps) => {
	const { isOpen, onOpenChange } = useDisclosure();
	const { data: workspaces } = useQuery(workspacesQuery);

	const workspace = useMemo(() => {
		return workspaces?.find((workspace) => workspace.id === workspaceId);
	}, [workspaces, workspaceId]);

	return (
		<Popover placement="bottom-end" isOpen={isOpen} onOpenChange={onOpenChange}>
			<PopoverTrigger>
				<Button isIconOnly size="sm" variant="flat">
					<LucideHistory className="size-3.5" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="p-0">
				<ScrollShadow className="max-h-96 p-2">
					<Listbox label="Version History">
						{versions.map((version) => {
							const user = workspace?.workspace_user.find(
								(user) => user.user_id === version.user_id,
							)?.users;

							const isStaging = stagingVersionId === version.id;
							const isProduction = productionVersionId === version.id;

							return (
								<ListboxItem
									variant="faded"
									key={version.id}
									onPress={() => {
										onSelectionChange(version);
										onOpenChange();
									}}
									title={version.id}
									description={`${format(version.created_at, "d LLL, hh:mm a")} by ${user?.name}`}
									startContent={
										<Avatar
											className="shrink-0"
											size="sm"
											src={`https://api.dicebear.com/9.x/initials/svg?seed=${user?.name}`}
											fallback={user?.name?.slice(0, 1)}
										/>
									}
									endContent={
										<div className="flex gap-1">
											{isStaging && (
												<Chip color="warning" size="sm" variant="flat">
													STAGING
												</Chip>
											)}
											{isProduction && (
												<Chip color="success" size="sm" variant="flat">
													PRODUCTION
												</Chip>
											)}
										</div>
									}
								/>
							);
						})}
					</Listbox>
				</ScrollShadow>
			</PopoverContent>
		</Popover>
	);
};
