import { Chip } from "@heroui/react";
import { AlertCircle, CheckCircle2, CircleSlash } from "lucide-react";

type RunStatus = "success" | "error" | "aborted";

// Aborted = the run was cancelled mid-flight (client disconnect), distinct from
// an error. Rendered in a neutral warning color so it doesn't read as a failure.
const config = {
	success: { color: "success", Icon: CheckCircle2, label: "Success" },
	error: { color: "danger", Icon: AlertCircle, label: "Error" },
	aborted: { color: "warning", Icon: CircleSlash, label: "Aborted" },
} as const;

export function RunStatusChip({ status }: { status: RunStatus }) {
	const { color, Icon, label } = config[status];
	return (
		<Chip variant="soft" color={color} size="sm">
			<Icon className="size-3" />
			{label}
		</Chip>
	);
}
