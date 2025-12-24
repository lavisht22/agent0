import {
	Card,
	CardBody,
	CardHeader,
	Chip,
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerHeader,
	User,
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
	stagingVersionId?: string | null;
	productionVersionId?: string | null;
	onSelectionChange: (version: Tables<"versions">) => void;
}

export const HistoryDrawer = ({
	isOpen,
	onOpenChange,
	workspaceId,
	versions,
	stagingVersionId,
	productionVersionId,
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

						const isStaging = stagingVersionId === version.id;
						const isProduction = productionVersionId === version.id;

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
								<CardHeader className="flex items-center justify-between gap-2">
									<p className="text-sm text-default-500">#{version.id}</p>

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
								</CardHeader>
								<CardBody className="gap-2 flex flex-col items-start">
									<p className="text-sm">
										{format(version.created_at, "d LLL, hh:mm a")}
									</p>
									<User
										name={user?.name}
										avatarProps={{
											size: "sm",
											src: `https://api.dicebear.com/9.x/initials/svg?seed=${user?.name}`,
											fallback: user?.name?.slice(0, 1),
										}}
									/>
								</CardBody>
							</Card>
						);
					})}
				</DrawerBody>
			</DrawerContent>
		</Drawer>
	);
};
