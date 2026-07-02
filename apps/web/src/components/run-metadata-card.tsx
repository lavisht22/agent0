import { Button, Card, Input, Popover, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LucidePlus, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { updateRunMetadata } from "@/lib/queries";

interface RunMetadataCardProps {
	workspaceId: string;
	runId: string;
	metadata: Record<string, string> | null;
	/** Extra content rendered in the same card below the metadata (e.g. lineage). */
	children?: ReactNode;
}

/**
 * Metadata panel on the run detail page. Shows each label as a pill with a
 * remove button, plus an "Add" popover to tag the run in place. Every edit is a
 * full-replace PATCH built from the current set.
 */
export function RunMetadataCard({
	workspaceId,
	runId,
	metadata,
	children,
}: RunMetadataCardProps) {
	const queryClient = useQueryClient();
	const [keyDraft, setKeyDraft] = useState("");
	const [valueDraft, setValueDraft] = useState("");

	const pairs = Object.entries(metadata ?? {});

	const mutation = useMutation({
		mutationFn: (next: Record<string, string>) =>
			updateRunMetadata(workspaceId, runId, next),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["run", runId] });
			queryClient.invalidateQueries({ queryKey: ["runs"] });
		},
		onError: (err) => {
			toast.danger(
				err instanceof Error ? err.message : "Failed to update metadata.",
			);
		},
	});

	const removePair = (key: string) => {
		const next = { ...(metadata ?? {}) };
		delete next[key];
		mutation.mutate(next);
	};

	const addPair = () => {
		const key = keyDraft.trim();
		if (!key) return;
		mutation.mutate(
			{ ...(metadata ?? {}), [key]: valueDraft },
			{
				onSuccess: () => {
					setKeyDraft("");
					setValueDraft("");
				},
			},
		);
	};

	return (
		<Card>
			<Card.Content className="space-y-4 text-sm">
				<div className="flex flex-col gap-1.5">
					<span className="text-muted">Metadata</span>
					<div className="flex flex-wrap items-center gap-1.5">
						{pairs.map(([k, v]) => (
							<div
								key={k}
								className="inline-flex items-center gap-1 rounded-full bg-[var(--color-default)] py-1 pl-3 pr-1.5"
							>
								<span>
									<span className="font-medium">{k}</span>
									<span className="text-muted"> = </span>
									<span className="text-muted">{v || '""'}</span>
								</span>
								<button
									type="button"
									aria-label={`Remove ${k}`}
									className="shrink-0 cursor-pointer rounded-full p-0.5 text-muted transition hover:text-foreground"
									onClick={() => removePair(k)}
								>
									<X className="size-3.5" />
								</button>
							</div>
						))}

						<Popover>
							<Popover.Trigger className="contents">
								<Button size="sm" variant="tertiary">
									<LucidePlus className="size-3.5" />
									Add
								</Button>
							</Popover.Trigger>
							<Popover.Content placement="bottom start">
								<Popover.Dialog className="flex w-72 flex-col gap-2 p-3">
									<div className="grid grid-cols-2 gap-2">
										<Input
											variant="secondary"
											fullWidth
											aria-label="Metadata key"
											placeholder="key"
											value={keyDraft}
											onChange={(e) => setKeyDraft(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") addPair();
											}}
										/>
										<Input
											variant="secondary"
											fullWidth
											aria-label="Metadata value"
											placeholder="value"
											value={valueDraft}
											onChange={(e) => setValueDraft(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") addPair();
											}}
										/>
									</div>
									<div className="flex justify-end">
										<Button
											size="sm"
											onPress={addPair}
											isPending={mutation.isPending}
											isDisabled={!keyDraft.trim()}
										>
											Add
										</Button>
									</div>
								</Popover.Dialog>
							</Popover.Content>
						</Popover>
					</div>
				</div>
				{children}
			</Card.Content>
		</Card>
	);
}
