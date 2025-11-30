import {
	Button,
	cn,
	Dropdown,
	DropdownItem,
	DropdownMenu,
	DropdownSection,
	DropdownTrigger,
} from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
	Bot,
	Key,
	LayoutDashboard,
	LucideChevronsUpDown,
	LucidePlusSquare,
	PlayCircle,
	Server,
} from "lucide-react";
import { useMemo } from "react";
import { workspacesQuery } from "@/lib/queries";
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

	// Check if current user is admin
	const { data: isAdmin } = useQuery({
		queryKey: ["workspace-role", workspaceId],
		queryFn: async () => {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) return false;

			const { data, error } = await supabase
				.from("workspace_user")
				.select("role")
				.eq("workspace_id", workspaceId)
				.eq("user_id", user.id)
				.single();

			if (error) return false;

			return data?.role === "admin";
		},
		enabled: !!workspaceId,
	});

	const navItems = useMemo(() => {
		const items = [
			{
				label: "Dashboard",
				icon: LayoutDashboard,
				path: `/workspace/${workspaceId}`,
				active: location.pathname === `/workspace/${workspaceId}`,
			},
			{
				label: "Providers",
				icon: Server,
				path: `/workspace/${workspaceId}/providers`,
				active: location.pathname === `/workspace/${workspaceId}/providers`,
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
		];

		// Only show API Keys for admin users
		if (isAdmin) {
			items.push({
				label: "API Keys",
				icon: Key,
				path: `/workspace/${workspaceId}/api-keys`,
				active: location.pathname === `/workspace/${workspaceId}/api-keys`,
			});
		}

		return items;
	}, [workspaceId, location.pathname, isAdmin]);

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

			<div className="border-t border-default-200">
				{/* TODO: Implement user menu here */}
			</div>
		</div>
	);
}
