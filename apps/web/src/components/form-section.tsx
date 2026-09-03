import type React from "react";

interface FormSectionProps {
	title: string;
	description?: React.ReactNode;
	/** Rendered at the right of the header row, e.g. an edit or add button. */
	action?: React.ReactNode;
	children?: React.ReactNode;
}

/**
 * A titled block with an optional right-aligned action in its header. Flat by
 * design — no border or padding — so sections sit inline with the plain fields
 * above them. Shared so the provider form's sections stay visually identical
 * rather than each hand-rolling the same header.
 */
export function FormSection({
	title,
	description,
	action,
	children,
}: FormSectionProps) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-sm font-medium text-foreground">{title}</p>
					{description && (
						<p className="text-xs text-muted mt-1">{description}</p>
					)}
				</div>
				{action && <div className="shrink-0">{action}</div>}
			</div>
			{children}
		</div>
	);
}
