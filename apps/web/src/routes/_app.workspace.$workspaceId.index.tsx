import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/workspace/$workspaceId/")({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/_app/workspace/$workspaceId"!</div>;
}
