import { addToast } from "@heroui/react";

export const copyToClipboard = (
	text: string,
	successMessage?: string,
	errorMessage?: string,
) => {
	try {
		navigator.clipboard.writeText(text);
		addToast({
			title: successMessage || "Copied!",
			color: "success",
		});
	} catch {
		addToast({
			title: errorMessage || "Unable to copy to clipboard.",
			color: "danger",
		});
	}
};
