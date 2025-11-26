import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "../lib/supabase";

export const Route = createFileRoute("/_app")({
	component: LayoutComponent,
	beforeLoad: async () => {
		const {
			data: { session },
		} = await supabase.auth.getSession();
		if (!session) {
			throw redirect({ to: "/auth" });
		}
	},
});

function LayoutComponent() {
	return <Outlet />;
}
