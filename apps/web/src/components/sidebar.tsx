import {
	Button,
	cn,
	Dropdown,
	DropdownItem,
	DropdownMenu,
	DropdownSection,
	DropdownTrigger,
	User,
} from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
	Bot,
	KeySquare,
	LayoutDashboard,
	LucideChevronsUpDown,
	LucideLogOut,
	LucidePlusSquare,
	PlayCircle,
	Server,
	Settings,
} from "lucide-react";
import { useMemo } from "react";
import { workspacesQuery, workspaceUserQuery } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

interface SidebarProps {
	workspaceId: string;
}

export function Sidebar({ workspaceId }: SidebarProps) {
	const { data: workspaces } = useQuery(workspacesQuery);
	const navigate = useNavigate();
	const location = useLocation();

	const currentWorkspace = useMemo(() => {
		return workspaces?.find((workspace) => workspace.id === workspaceId);
	}, [workspaces, workspaceId]);

	const { data: user } = useQuery(workspaceUserQuery(workspaceId));

	const navItems = useMemo(() => {
		const items = [
			{
				label: "Dashboard",
				icon: LayoutDashboard,
				path: `/workspace/${workspaceId}`,
				active: location.pathname === `/workspace/${workspaceId}`,
			},

			{
				label: "Agents",
				icon: Bot,
				path: `/workspace/${workspaceId}/agents`,
				active: location.pathname === `/workspace/${workspaceId}/agents`,
			},
			{
				label: "Runs",
				icon: PlayCircle,
				path: `/workspace/${workspaceId}/runs`,
				active: location.pathname === `/workspace/${workspaceId}/runs`,
			},
			{
				label: "Providers",
				icon: Server,
				path: `/workspace/${workspaceId}/providers`,
				active: location.pathname === `/workspace/${workspaceId}/providers`,
			},
		];

		// Only show API Keys and Settings for admin users
		if (user?.role === "admin") {
			items.push({
				label: "API Keys",
				icon: KeySquare,
				path: `/workspace/${workspaceId}/api-keys`,
				active: location.pathname === `/workspace/${workspaceId}/api-keys`,
			});
			items.push({
				label: "Settings",
				icon: Settings,
				path: `/workspace/${workspaceId}/settings`,
				active: location.pathname === `/workspace/${workspaceId}/settings`,
			});
		}

		return items;
	}, [workspaceId, location.pathname, user]);

	return (
		<div className={`border-r border-default-200 flex flex-col w-52`}>
			<div className="border-b border-default-200">
				<Dropdown
					size="lg"
					classNames={{
						trigger: "scale-100!",
						content: "w-full w-56",
					}}
				>
					<DropdownTrigger>
						<div className="w-full flex justify-between items-center px-4 h-16 hover:bg-default-100 cursor-pointer">
							<div>
								<span className="block text-[10px] text-default-500 leading-tight">
									WORKSPACE
								</span>
								<span className="font-medium">
									{currentWorkspace?.name || ""}
								</span>
							</div>
							<LucideChevronsUpDown className="size-4" />
						</div>
					</DropdownTrigger>
					<DropdownMenu aria-label="Workspace selection">
						<DropdownSection showDivider>
							{(workspaces || []).map((workspace) => (
								<DropdownItem
									key={workspace.id}
									onPress={() => {
										navigate({ to: `/workspace/${workspace.id}` });
										localStorage.setItem("lastAccessedWorkspace", workspace.id);
									}}
								>
									{workspace.name}
								</DropdownItem>
							))}
						</DropdownSection>
						<DropdownItem
							key="create"
							startContent={<LucidePlusSquare className="size-4" />}
							onPress={() => navigate({ to: "/create-workspace" })}
						>
							Create Workspace
						</DropdownItem>
					</DropdownMenu>
				</Dropdown>
			</div>

			<nav className="flex-1 py-4 px-1.5 space-y-1 overflow-y-auto">
				{navItems.map((item) => {
					const Icon = item.icon;

					return (
						<Button
							key={item.label}
							variant="light"
							className={cn(
								"w-full justify-start px-2.5 hover:text-default-900",
								!item.active && "text-default-500",
								item.active && "bg-default-100",
							)}
							startContent={<Icon className="size-5" />}
							onPress={() => navigate({ to: item.path })}
						>
							{item.label}
						</Button>
					);
				})}
			</nav>

			<div className="border-t border-default-200 p-4">
				<Dropdown placement="right-start">
					<DropdownTrigger className="cursor-pointer">
						<User
							name={user?.name || ""}
							description={user?.email || ""}
							avatarProps={{
								size: "sm",
								src: `https://api.dicebear.com/9.x/initials/svg?seed=${user?.name}`,
							}}
						/>
					</DropdownTrigger>
					<DropdownMenu>
						<DropdownItem
							key="logout"
							color="danger"
							startContent={<LucideLogOut className="size-4" />}
							onPress={() => {
								supabase.auth.signOut();
								navigate({ to: "/" });
							}}
						>
							Logout
						</DropdownItem>
					</DropdownMenu>
				</Dropdown>
			</div>
		</div>
	);
}
