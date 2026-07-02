import { Button, Card, Input, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, LucidePlus, LucideTrash2, Pencil, X } from "lucide-react";
import { nanoid } from "nanoid";
import { useState } from "react";
import { updateRunMetadata } from "@/lib/queries";

interface RunMetadataCardProps {
	workspaceId: string;
	runId: string;
	metadata: Record<string, string> | null;
}

type Row = { id: string; key: string; value: string };

const toRows = (metadata: Record<string, string> | null): Row[] =>
	Object.entries(metadata ?? {}).map(([key, value]) => ({
		id: nanoid(),
		key,
		value,
	}));

/**
 * Metadata panel on the run detail page. Shows the run's labels and lets the
 * user edit them after the fact (tag a run so it can be filtered later). Full
 * replace on save — the editor holds the complete set.
 */
export function RunMetadataCard({
	workspaceId,
	runId,
	metadata,
}: RunMetadataCardProps) {
	const queryClient = useQueryClient();
	const [isEditing, setIsEditing] = useState(false);
	const [rows, setRows] = useState<Row[]>(() => toRows(metadata));

	const mutation = useMutation({
		mutationFn: (next: Record<string, string>) =>
			updateRunMetadata(workspaceId, runId, next),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["run", runId] });
			queryClient.invalidateQueries({ queryKey: ["runs"] });
			toast.success("Metadata updated.");
			setIsEditing(false);
		},
		onError: (err) => {
			toast.danger(
				err instanceof Error ? err.message : "Failed to update metadata.",
			);
		},
	});

	const startEditing = () => {
		setRows(toRows(metadata));
		setIsEditing(true);
	};

	const save = () => {
		const next: Record<string, string> = {};
		for (const row of rows) {
			const key = row.key.trim();
			if (key) next[key] = row.value;
		}
		mutation.mutate(next);
	};

	const pairs = Object.entries(metadata ?? {});

	return (
		<Card>
			<Card.Content className="space-y-3 text-sm">
				<div className="flex items-center justify-between">
					<span className="text-muted">Metadata</span>
					{!isEditing && (
						<Button
							size="sm"
							variant="tertiary"
							onPress={startEditing}
							aria-label="Edit metadata"
						>
							<Pencil className="size-3.5" />
							{pairs.length > 0 ? "Edit" : "Add"}
						</Button>
					)}
				</div>

				{isEditing ? (
					<div className="flex flex-col gap-2">
						{rows.map((row, index) => (
							<div key={row.id} className="flex items-center gap-2">
								<Input
									variant="secondary"
									aria-label="Metadata key"
									placeholder="key"
									className="min-w-0 flex-1"
									value={row.key}
									onChange={(e) => {
										const next = [...rows];
										next[index] = { ...row, key: e.target.value };
										setRows(next);
									}}
								/>
								<Input
									variant="secondary"
									aria-label="Metadata value"
									placeholder="value"
									className="min-w-0 flex-1"
									value={row.value}
									onChange={(e) => {
										const next = [...rows];
										next[index] = { ...row, value: e.target.value };
										setRows(next);
									}}
								/>
								<Button
									isIconOnly
									variant="tertiary"
									aria-label="Remove metadata row"
									className="shrink-0"
									onPress={() => setRows(rows.filter((r) => r.id !== row.id))}
								>
									<LucideTrash2 className="size-4" />
								</Button>
							</div>
						))}
						<div className="flex items-center justify-between gap-2">
							<Button
								size="sm"
								variant="tertiary"
								onPress={() =>
									setRows([...rows, { id: nanoid(), key: "", value: "" }])
								}
							>
								<LucidePlus className="size-3.5" />
								Add row
							</Button>
							<div className="flex items-center gap-2">
								<Button
									size="sm"
									variant="tertiary"
									isDisabled={mutation.isPending}
									onPress={() => setIsEditing(false)}
								>
									<X className="size-3.5" />
									Cancel
								</Button>
								<Button size="sm" onPress={save} isPending={mutation.isPending}>
									<Check className="size-3.5" />
									Save
								</Button>
							</div>
						</div>
					</div>
				) : pairs.length > 0 ? (
					<div className="flex flex-wrap gap-1.5">
						{pairs.map(([k, v]) => (
							<div
								key={k}
								className="inline-flex items-center gap-1 rounded-md bg-surface-secondary px-2 py-0.5 text-xs"
							>
								<span className="font-medium">{k}</span>
								<span className="text-muted">=</span>
								<span>{v}</span>
							</div>
						))}
					</div>
				) : (
					<p className="text-muted">
						No metadata. Add labels to filter by later.
					</p>
				)}
			</Card.Content>
		</Card>
	);
}
