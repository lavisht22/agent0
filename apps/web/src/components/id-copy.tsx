import { Button } from "@heroui/react";
import { LucideCheck, LucideCopy } from "lucide-react";
import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

export default function IDCopy({
	id,
	redacted,
}: {
	id: string;
	redacted?: string;
}) {
	const [copied, setCopied] = useState(false);

	return (
		<Button
			variant="tertiary"
			size="sm"
			onPress={() => {
				copyToClipboard(id);

				setCopied(true);
				setTimeout(() => {
					setCopied(false);
				}, 2000);
			}}
		>
			<span className="font-mono">{redacted || id}</span>
			{!copied ? (
				<LucideCopy className="size-3.5" />
			) : (
				<LucideCheck className="size-3.5" />
			)}
		</Button>
	);
}
