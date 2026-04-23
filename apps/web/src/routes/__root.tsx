import { RouterProvider } from "@heroui/react";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, Outlet, useRouter } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

function RootComponent() {
	const router = useRouter();

	return (
		<RouterProvider
			navigate={(to) => router.navigate({ to })}
			useHref={(href) => router.buildLocation({ to: href }).href}
		>
			<Outlet />
			<TanStackDevtools
				config={{
					position: "bottom-right",
				}}
				plugins={[
					{
						name: "Tanstack Router",
						render: <TanStackRouterDevtoolsPanel />,
					},
				]}
			/>
		</RouterProvider>
	);
}

export const Route = createRootRoute({
	component: RootComponent,
});
