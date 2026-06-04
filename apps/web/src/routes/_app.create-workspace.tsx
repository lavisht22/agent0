import {
	Button,
	FieldError,
	Form,
	Input,
	Label,
	Spinner,
	TextField,
	toast,
} from "@heroui/react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { createWorkspace } from "../lib/queries";

export const Route = createFileRoute("/_app/create-workspace")({
	component: RouteComponent,
});

function RouteComponent() {
	const navigate = useNavigate();

	const [name, setName] = useState("");

	const createWorkspaceMutation = useMutation({
		mutationFn: (name: string) => createWorkspace(name),
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to create workspace.",
			);
		},
		onSuccess: (workspace) => {
			// TODO: Invalidate the workspaces query
			navigate({ to: `/workspace/${workspace.id}` });
		},
	});

	const handleCreateWorkspace = async (e: React.FormEvent) => {
		e.preventDefault();
		createWorkspaceMutation.mutate(name);
	};

	return (
		<div className="min-h-screen flex flex-col items-center justify-center p-4">
			<div className="w-full max-w-sm space-y-8">
				<div className="text-center space-y-2">
					<h1 className="text-3xl font-medium tracking-tight">New Workspace</h1>
					<p className="text-muted">Create a new workspace</p>
				</div>
				<Form onSubmit={handleCreateWorkspace} className="flex flex-col gap-4">
					<TextField name="name" isRequired className="w-full">
						<Label>Name</Label>
						<Input
							placeholder="Workspace Name"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
						<FieldError />
					</TextField>
					<Button
						type="submit"
						variant="primary"
						isPending={createWorkspaceMutation.isPending}
						size="lg"
						className="w-full"
					>
						{({ isPending }) => (
							<>
								{isPending && <Spinner color="current" size="sm" />}
								Create
							</>
						)}
					</Button>
				</Form>
			</div>
		</div>
	);
}
