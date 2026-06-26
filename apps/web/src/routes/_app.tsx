import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { api } from "../lib/api-client";
import { getCachedSession } from "../lib/auth-client";

type WorkspaceListItem = { id: string };

export const Route = createFileRoute("/_app")({
	component: LayoutComponent,
	beforeLoad: async ({ location }) => {
		// Ask better-auth whether the httpOnly session cookie is valid (cached for
		// the app lifetime). No session → back to login.
		const session = await getCachedSession();
		if (!session) {
			throw redirect({ to: "/auth", search: { redirect: undefined } });
		}

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

			// Runner returns workspaces oldest-first.
			const { data: workspaces } = await api.get<{
				data: WorkspaceListItem[];
			}>("/api/v1/workspaces");

			if (workspaces.length === 0) {
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
