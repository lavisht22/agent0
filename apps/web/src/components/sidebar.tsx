import {
	Avatar,
	Button,
	Chip,
	cn,
	Dropdown,
	Label,
	Separator,
	Tooltip,
} from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
	Bot,
	KeySquare,
	LayoutDashboard,
	LucideChevronsUpDown,
	LucideLogOut,
	LucidePalette,
	LucidePanelLeftClose,
	LucidePanelLeftOpen,
	LucidePlusSquare,
	PlayCircle,
	Plug,
	Server,
	Settings,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { workspacesQuery, workspaceUserQuery } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/use-theme";

interface SidebarProps {
	workspaceId: string;
}

const COLLAPSED_STORAGE_KEY = "sidebar-collapsed";

function getInitials(name: string | undefined | null): string {
	if (!name) return "?";
	return (
		name
			.split(" ")
			.map((s) => s[0])
			.join("")
			.slice(0, 2)
			.toUpperCase() || "?"
	);
}

function readInitialCollapsed(): boolean {
	if (typeof window === "undefined") return false;
	return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
}

export function Sidebar({ workspaceId }: SidebarProps) {
	const { theme, setTheme } = useTheme();

	const { data: workspaces } = useQuery(workspacesQuery);
	const navigate = useNavigate();
	const location = useLocation();

	const [collapsed, setCollapsed] = useState<boolean>(readInitialCollapsed);

	useEffect(() => {
		window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
	}, [collapsed]);

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
				e.preventDefault();
				setCollapsed((c) => !c);
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

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
			{
				label: "MCP Servers",
				icon: Plug,
				path: `/workspace/${workspaceId}/mcps`,
				active: location.pathname === `/workspace/${workspaceId}/mcps`,
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
		<div
			className={cn(
				"group/sidebar relative border-r border-border flex flex-col transition-[width] duration-200 ease-out",
				collapsed ? "w-16" : "w-52",
			)}
		>
			<div className="border-b border-border">
				<Dropdown>
					<Dropdown.Trigger className="w-full flex items-center justify-between gap-2 h-16 px-4 hover:bg-surface-hover cursor-pointer text-left overflow-hidden">
						<div className="flex items-center gap-2 min-w-0">
							<Avatar size="sm">
								<Avatar.Fallback>
									{getInitials(currentWorkspace?.name)}
								</Avatar.Fallback>
							</Avatar>
							{!collapsed && (
								<div className="min-w-0">
									<span className="block text-[10px] text-muted leading-tight">
										WORKSPACE
									</span>
									<span className="font-medium block truncate whitespace-nowrap">
										{currentWorkspace?.name || ""}
									</span>
								</div>
							)}
						</div>
						{!collapsed && (
							<LucideChevronsUpDown className="size-4 shrink-0" />
						)}
					</Dropdown.Trigger>
					<Dropdown.Popover className="w-56">
						<Dropdown.Menu aria-label="Workspace selection">
							<Dropdown.Section>
								{(workspaces || []).map((workspace) => (
									<Dropdown.Item
										key={workspace.id}
										id={workspace.id}
										textValue={workspace.name}
										onAction={() => {
											navigate({ to: `/workspace/${workspace.id}` });
											localStorage.setItem(
												"lastAccessedWorkspace",
												workspace.id,
											);
										}}
									>
										<Label>{workspace.name}</Label>
									</Dropdown.Item>
								))}
							</Dropdown.Section>
							<Separator />
							<Dropdown.Item
								key="create"
								id="create"
								textValue="Create Workspace"
								onAction={() => navigate({ to: "/create-workspace" })}
							>
								<LucidePlusSquare className="size-4" />
								<Label>Create Workspace</Label>
							</Dropdown.Item>
						</Dropdown.Menu>
					</Dropdown.Popover>
				</Dropdown>
			</div>

			<nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
				{navItems.map((item) => {
					const Icon = item.icon;

					return (
						<Link
							key={item.label}
							to={item.path}
							aria-label={collapsed ? item.label : undefined}
							className={cn(
								"group flex items-center w-full h-10 pl-4 pr-2 gap-2.5 rounded-md text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent overflow-hidden",
								!item.active &&
									"text-foreground hover:bg-surface-hover active:bg-surface-secondary",
								item.active && "bg-accent/10 text-accent font-medium",
							)}
						>
							<Icon className="size-4 shrink-0" />
							{!collapsed && (
								<span className="truncate whitespace-nowrap">
									{item.label}
								</span>
							)}
						</Link>
					);
				})}
			</nav>

			<div className="border-t border-border p-4 overflow-hidden">
				<Dropdown>
					<Dropdown.Trigger className="flex items-center gap-2 w-full text-left cursor-pointer">
						<Avatar size="sm">
							<Avatar.Image
								src={`https://api.dicebear.com/9.x/initials/svg?seed=${user?.name}`}
								alt={user?.name || ""}
							/>
							<Avatar.Fallback>{getInitials(user?.name)}</Avatar.Fallback>
						</Avatar>
						{!collapsed && (
							<div className="flex flex-col min-w-0">
								<span className="text-sm font-medium truncate whitespace-nowrap">
									{user?.name || ""}
								</span>
								<span className="text-xs text-muted truncate whitespace-nowrap">
									{user?.email || ""}
								</span>
							</div>
						)}
					</Dropdown.Trigger>
					<Dropdown.Popover className="w-64" placement="top start">
						<Dropdown.Menu>
							<Dropdown.Item
								key="theme"
								id="theme"
								textValue="Switch Theme"
								onAction={() => {
									// Cycle through: light → dark → system → light
									if (theme === "light") {
										setTheme("dark");
									} else if (theme === "dark") {
										setTheme("system");
									} else {
										setTheme("light");
									}
								}}
							>
								<LucidePalette className="size-4" />
								<Label>Switch Theme</Label>
								<Chip size="sm" variant="secondary">
									{theme}
								</Chip>
							</Dropdown.Item>
							<Dropdown.Item
								key="logout"
								id="logout"
								textValue="Logout"
								variant="danger"
								onAction={() => {
									supabase.auth.signOut();
									navigate({ to: "/" });
								}}
							>
								<LucideLogOut className="size-4" />
								<Label>Logout</Label>
							</Dropdown.Item>
						</Dropdown.Menu>
					</Dropdown.Popover>
				</Dropdown>
			</div>

			<Tooltip delay={300}>
				<Tooltip.Trigger>
					<Button
						isIconOnly
						size="sm"
						variant="tertiary"
						aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
						onPress={() => setCollapsed((c) => !c)}
						className={cn(
							"absolute top-1/2 -right-3 -translate-y-1/2 z-10",
							"h-6 w-6 min-w-0 rounded-full bg-surface border border-border shadow-sm",
							"opacity-0 group-hover/sidebar:opacity-100 focus-visible:opacity-100 transition-opacity",
						)}
					>
						{collapsed ? (
							<LucidePanelLeftOpen className="size-3.5" />
						) : (
							<LucidePanelLeftClose className="size-3.5" />
						)}
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content placement="right">
					{collapsed ? "Expand sidebar" : "Collapse sidebar"} (⌘B)
				</Tooltip.Content>
			</Tooltip>
		</div>
	);
}
