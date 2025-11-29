import { addToast, Button, Form, Input } from "@heroui/react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { useState } from "react";
import { supabase } from "../lib/supabase";

export const Route = createFileRoute("/_app/create-workspace")({
	component: RouteComponent,
});

function RouteComponent() {
	const navigate = useNavigate();

	const [name, setName] = useState("");

	const createWorkspace = useMutation({
		mutationFn: async (name: string) => {
			const id = nanoid();

			const { data, error } = await supabase
				.from("workspaces")
				.insert({
					id,
					name,
				})
				.select()
				.single();

			if (error) {
				throw error;
			}

			return data;
		},
		onError: (error) => {
			addToast({
				description:
					error instanceof Error
						? error.message
						: "Failed to create workspace.",
				color: "danger",
			});
		},
		onSuccess: (workspace) => {
			// TODO: Invalidate the workspaces query
			navigate({ to: `/workspace/${workspace.id}` });
		},
	});

	const handleCreateWorkspace = async (e: React.FormEvent) => {
		e.preventDefault();
		createWorkspace.mutate(name);
	};

	return (
		<div className="min-h-screen flex flex-col items-center justify-center p-4">
			<div className="w-full max-w-sm space-y-8">
				<div className="text-center space-y-2">
					<h1 className="text-3xl font-medium tracking-tight">New Workspace</h1>
					<p className="text-default-500">Create a new workspace</p>
				</div>
				<Form onSubmit={handleCreateWorkspace} className="flex flex-col gap-4">
					<Input
						label="Name"
						placeholder="Workspace Name"
						value={name}
						onValueChange={setName}
						isRequired
						variant="bordered"
					/>
					<Button
						type="submit"
						color="primary"
						isLoading={createWorkspace.isPending}
						fullWidth
						size="lg"
					>
						Create
					</Button>
				</Form>
			</div>
		</div>
	);
}
