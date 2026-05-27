import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/account")({
	component: RouteComponent,
});

function RouteComponent() {
	return <Outlet />;
}
