import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { api } from "../lib/api-client";
import { getSessionToken } from "../lib/auth-client";

type WorkspaceListItem = { id: string };

export const Route = createFileRoute("/_app")({
	component: LayoutComponent,
	beforeLoad: async ({ location }) => {
		// The better-auth session token lives only in memory; no token means no
		// authenticated session (e.g. after a reload) → back to login.
		if (!getSessionToken()) {
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
