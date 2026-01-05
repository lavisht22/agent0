import { Chip } from "@heroui/react";

interface TagChipProps {
	name: string;
	color: string;
	size?: "sm" | "md" | "lg";
	onRemove?: () => void;
	onClick?: () => void;
}

/**
 * Converts a hex color to an rgba string with the specified opacity.
 */
function hexToRgba(hex: string, opacity: number): string {
	const cleanHex = hex.replace("#", "");
	const r = parseInt(cleanHex.substring(0, 2), 16);
	const g = parseInt(cleanHex.substring(2, 4), 16);
	const b = parseInt(cleanHex.substring(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function TagChip({ name, color, size = "sm", onRemove }: TagChipProps) {
	const bgColor = hexToRgba(color, 0.2);

	return (
		<Chip
			size={size}
			variant="flat"
			style={{
				backgroundColor: bgColor,
				color: color,
			}}
			classNames={{
				content: "font-medium",
			}}
			onClose={onRemove}
		>
			{name}
		</Chip>
	);
}
