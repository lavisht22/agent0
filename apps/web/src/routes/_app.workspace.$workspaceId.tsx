import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "../components/sidebar";

export const Route = createFileRoute("/_app/workspace/$workspaceId")({
	component: RouteComponent,
});

function RouteComponent() {
	const { workspaceId } = Route.useParams();

	return (
		<div className="flex h-screen overflow-hidden">
			<Sidebar workspaceId={workspaceId} />
			<div className="flex-1 overflow-y-auto">
				<Outlet />
			</div>
		</div>
	);
}
