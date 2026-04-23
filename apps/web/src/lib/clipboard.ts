import { toast } from "@heroui/react";

export const copyToClipboard = (
	text: string,
	successMessage?: string,
	errorMessage?: string,
) => {
	try {
		navigator.clipboard.writeText(text);
		toast.success(successMessage || "Copied!");
	} catch {
		toast.danger(errorMessage || "Unable to copy to clipboard.");
	}
};
