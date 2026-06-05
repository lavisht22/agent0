import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { api } from "../lib/api-client";
import { supabase } from "../lib/supabase";

type WorkspaceListItem = { id: string };

export const Route = createFileRoute("/_app")({
	component: LayoutComponent,
	beforeLoad: async ({ location }) => {
		const {
			data: { session },
		} = await supabase.auth.getSession();
		if (!session) {
			throw redirect({ to: "/auth" });
		}

		// If user is at the root of the app, redirect to last accessed or first workspace
		if (location.pathname === "/") {
			const lastAccessedWorkspace = localStorage.getItem(
				"lastAccessedWorkspace",
			);

			if (lastAccessedWorkspace) {
				throw redirect({
					to: "/workspace/$workspaceId",
					params: { workspaceId: lastAccessedWorkspace },
				});
			}

			// Fetch workspaces (runner returns them oldest-first, matching the old
			// `order(created_at asc).limit(1)`).
			const { data: workspaces } = await api.get<{
				data: WorkspaceListItem[];
			}>("/api/v1/workspaces");

			if (workspaces.length === 0) {
				// No workspaces exist, redirect to create workspace
				throw redirect({ to: "/create-workspace" });
			}

			throw redirect({
				to: "/workspace/$workspaceId",
				params: {
					workspaceId: workspaces[0].id,
				},
			});
		}
	},
});

function LayoutComponent() {
	return <Outlet />;
}
