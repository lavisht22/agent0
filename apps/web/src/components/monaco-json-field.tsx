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
	language?: string;
	// When true, the field stretches to fill its parent height (parent must
	// provide flex/explicit height) and the editor inside fills it.
	fillHeight?: boolean;
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
	language = "json",
	fillHeight = false,
}: MonacoJsonFieldProps) {
	return (
		<div
			className={cn("space-y-1", fillHeight && "flex flex-col flex-1 min-h-0")}
		>
			<div
				className={cn(
					"rounded-[14px] border-2 border-border overflow-hidden",
					fillHeight && "flex flex-col flex-1 min-h-0",
				)}
			>
				<span className="block text-xs ml-3 my-2 shrink-0">
					{label}
					{isRequired && <span className="text-danger">*</span>}
				</span>
				<div
					className={cn(fillHeight && "flex-1 min-h-0")}
					style={fillHeight ? undefined : { height: "auto" }}
				>
					<MonacoJsonEditor
						value={value}
						onValueChange={onValueChange}
						minHeight={editorMinHeight}
						language={language}
						fillHeight={fillHeight}
					/>
				</div>
			</div>
			<p className={cn("ml-1 text-xs text-muted", isInvalid && "text-danger")}>
				{errorMessage ? errorMessage : description}
			</p>
		</div>
	);
}
