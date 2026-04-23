import { cn } from "@heroui/react";
import { MonacoJsonEditor } from "./monaco-json-editor";

interface MonacoJsonFieldProps {
	label: string;
	isRequired?: boolean;
	description?: string;
	value: string;
	onValueChange: (value: string) => void;
	isInvalid?: boolean;
	errorMessage?: string | null;
	editorMinHeight?: number;
}

export function MonacoJsonField({
	label,
	isRequired,
	description,
	value,
	onValueChange,
	isInvalid,
	errorMessage,
	editorMinHeight,
}: MonacoJsonFieldProps) {
	return (
		<div className="space-y-1">
			<div className="rounded-[14px] border-2 border-border overflow-hidden">
				<span className="block text-xs ml-3 my-2">
					{label}
					{isRequired && <span className="text-danger">*</span>}
				</span>
				<MonacoJsonEditor
					value={value}
					onValueChange={onValueChange}
					minHeight={editorMinHeight}
				/>
			</div>
			<p className={cn("ml-1 text-xs text-muted", isInvalid && "text-danger")}>
				{errorMessage ? errorMessage : description}
			</p>
		</div>
	);
}
