import {
	Avatar,
	Card,
	CardBody,
	CardHeader,
	Chip,
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerHeader,
} from "@heroui/react";
import type { Tables } from "@repo/database";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useMemo } from "react";
import { workspacesQuery } from "@/lib/queries";

interface HistoryDrawerProps {
	isOpen: boolean;
	onOpenChange: () => void;
	workspaceId: string;
	versions: Tables<"versions">[];
	onSelectionChange: (version: Tables<"versions">) => void;
}

export const HistoryDrawer = ({
	isOpen,
	onOpenChange,
	workspaceId,
	versions,
	onSelectionChange,
}: HistoryDrawerProps) => {
	const { data: workspaces } = useQuery(workspacesQuery);

	const workspace = useMemo(() => {
		return workspaces?.find((workspace) => workspace.id === workspaceId);
	}, [workspaces, workspaceId]);

	return (
		<Drawer
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			title="History"
			scrollBehavior="inside"
		>
			<DrawerContent>
				<DrawerHeader>Version History</DrawerHeader>
				<DrawerBody className="pb-6">
					{versions.map((version) => {
						const user = workspace?.workspace_user.find(
							(user) => user.user_id === version.user_id,
						)?.users;

						return (
							<Card
								className="shrink-0"
								key={version.id}
								isPressable
								onPress={() => {
									onSelectionChange(version);
									onOpenChange();
								}}
							>
								<CardHeader className="flex items-center justify-between">
									<p className="text-sm text-default-500">#{version.id}</p>

									{version.is_deployed && (
										<Chip color="success" size="sm" variant="flat">
											PUBLISHED
										</Chip>
									)}
								</CardHeader>
								<CardBody className="gap-2">
									<p className="text-sm">
										{format(version.created_at, "d LLL, hh:mm a")}
									</p>
									<div className="flex gap-2 items-center">
										<Avatar
											size="sm"
											src={`https://api.dicebear.com/9.x/initials/svg?seed=${user?.name}`}
											fallback={user?.name?.slice(0, 1)}
										/>

										<p className="text-sm">{user?.name}</p>
									</div>
								</CardBody>
							</Card>
						);
					})}
				</DrawerBody>
			</DrawerContent>
		</Drawer>
	);
};
