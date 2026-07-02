import { Button } from "@heroui/react";

interface RunMetadataCellProps {
	metadata: Record<string, string> | null;
	/** Apply a single key/value pair as a filter on the runs list. */
	onFilter: (key: string, value: string) => void;
}

/**
 * Metadata column cell: each label is a button that applies it as a filter.
 * Display + filter only — tagging a run is done from the run detail page.
 */
export function RunMetadataCell({ metadata, onFilter }: RunMetadataCellProps) {
	const pairs = Object.entries(metadata ?? {});

	if (pairs.length === 0) {
		return <span className="text-muted">-</span>;
	}

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{pairs.map(([k, v]) => (
				<Button
					key={k}
					size="sm"
					variant="tertiary"
					onPress={() => onFilter(k, v)}
				>
					<span>
						<span className="font-medium">{k}</span>
						<span className="text-muted"> = </span>
						<span className="text-muted">{v}</span>
					</span>
				</Button>
			))}
		</div>
	);
}
