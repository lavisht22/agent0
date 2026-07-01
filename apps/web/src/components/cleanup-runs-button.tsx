import { Button, Modal, Spinner, toast, useOverlayState } from "@heroui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import {
	cleanupPreviewQuery,
	runCleanup,
	workspacesQuery,
} from "@/lib/queries";

function Bar({ done, total }: { done: number; total: number }) {
	const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 100;
	return (
		<div className="h-2 w-full rounded-full bg-surface-tertiary overflow-hidden">
			<div
				className="h-full bg-accent transition-all"
				style={{ width: `${pct}%` }}
			/>
		</div>
	);
}

/**
 * Admin-only control to run retention cleanup. Renders nothing unless the caller
 * is a workspace admin and there are runs eligible under the configured windows.
 */
export function CleanupRunsButton({ workspaceId }: { workspaceId: string }) {
	const queryClient = useQueryClient();
	const { data: workspaces } = useQuery(workspacesQuery);
	const workspace = workspaces?.find((w) => w.id === workspaceId);
	const isAdmin = workspace?.role === "admin";

	const { data: preview } = useQuery(
		cleanupPreviewQuery(workspaceId, !!isAdmin),
	);

	const state = useOverlayState();
	const abortRef = useRef<AbortController | null>(null);
	const [running, setRunning] = useState(false);
	const [finished, setFinished] = useState(false);
	const [logsDone, setLogsDone] = useState(0);
	const [runsDone, setRunsDone] = useState(0);

	const totalLogs = preview?.logs_eligible ?? 0;
	const totalRuns = preview?.runs_eligible ?? 0;

	// Hide entirely unless there's something an admin can clean up.
	if (!isAdmin || totalLogs + totalRuns === 0) return null;

	const reset = () => {
		setRunning(false);
		setFinished(false);
		setLogsDone(0);
		setRunsDone(0);
	};

	const open = () => {
		reset();
		state.open();
	};

	const close = () => {
		abortRef.current?.abort();
		abortRef.current = null;
		state.close();
	};

	const start = async () => {
		setRunning(true);
		setFinished(false);
		setLogsDone(0);
		setRunsDone(0);
		const controller = new AbortController();
		abortRef.current = controller;
		try {
			await runCleanup(
				workspaceId,
				(event) => {
					if (event.type === "progress") {
						if (event.phase === "logs") setLogsDone(event.processed);
						else setRunsDone(event.processed);
					} else if (event.type === "done") {
						setLogsDone(event.logs_deleted);
						setRunsDone(event.runs_deleted);
						setFinished(true);
					} else if (event.type === "error") {
						toast.danger(event.message);
					}
				},
				controller.signal,
			);
			queryClient.invalidateQueries({ queryKey: ["runs"] });
			queryClient.invalidateQueries({
				queryKey: ["runs-cleanup-preview", workspaceId],
			});
			toast.success("Cleanup complete.");
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") return;
			toast.danger(error instanceof Error ? error.message : "Cleanup failed.");
		} finally {
			setRunning(false);
			abortRef.current = null;
		}
	};

	return (
		<>
			<Button size="sm" variant="danger-soft" onPress={open}>
				<Trash2 className="size-3.5" />
				Clean up
			</Button>

			<Modal>
				<Modal.Backdrop
					isOpen={state.isOpen}
					onOpenChange={(isOpen) => (isOpen ? state.open() : close())}
				>
					<Modal.Container>
						<Modal.Dialog>
							<Modal.Header className="flex flex-col gap-1">
								<Modal.Heading>Clean up old runs</Modal.Heading>
							</Modal.Header>
							<Modal.Body>
								<div className="flex flex-col gap-4 p-1">
									{!running && !finished && (
										<p className="text-sm text-muted">
											This permanently deletes runs past this workspace's
											retention windows. It cannot be undone.
										</p>
									)}

									{totalLogs > 0 && (
										<div className="flex flex-col gap-1">
											<div className="flex justify-between text-sm">
												<span>Run logs to purge (metrics kept)</span>
												<span className="text-muted tabular-nums">
													{running || finished
														? `${logsDone.toLocaleString()} / ${totalLogs.toLocaleString()}`
														: totalLogs.toLocaleString()}
												</span>
											</div>
											{(running || finished) && (
												<Bar done={logsDone} total={totalLogs} />
											)}
										</div>
									)}

									{totalRuns > 0 && (
										<div className="flex flex-col gap-1">
											<div className="flex justify-between text-sm">
												<span>Runs to delete entirely</span>
												<span className="text-muted tabular-nums">
													{running || finished
														? `${runsDone.toLocaleString()} / ${totalRuns.toLocaleString()}`
														: totalRuns.toLocaleString()}
												</span>
											</div>
											{(running || finished) && (
												<Bar done={runsDone} total={totalRuns} />
											)}
										</div>
									)}

									{finished && (
										<p className="text-sm text-success">
											Deleted {logsDone.toLocaleString()} log
											{logsDone === 1 ? "" : "s"} and{" "}
											{runsDone.toLocaleString()} run
											{runsDone === 1 ? "" : "s"}.
										</p>
									)}
								</div>
							</Modal.Body>
							<Modal.Footer>
								{finished ? (
									<Button variant="primary" onPress={close}>
										Done
									</Button>
								) : (
									<>
										<Button variant="tertiary" onPress={close} type="button">
											Cancel
										</Button>
										<Button
											variant="danger"
											isDisabled={running}
											onPress={start}
										>
											{running && <Spinner color="current" size="sm" />}
											{running ? "Deleting…" : "Delete"}
										</Button>
									</>
								)}
							</Modal.Footer>
						</Modal.Dialog>
					</Modal.Container>
				</Modal.Backdrop>
			</Modal>
		</>
	);
}
