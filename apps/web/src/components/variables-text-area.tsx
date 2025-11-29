import { Button, cn } from "@heroui/react";
import { LucideBraces } from "lucide-react";
import { useMemo } from "react";
import TextareaAutosize, {
	type TextareaAutosizeProps,
} from "react-textarea-autosize";

type VariablesTextAreaProps = TextareaAutosizeProps & {
	onVariablePress: () => void;
};

export function VariablesTextArea({
	value,
	onVariablePress,
	className,
	...props
}: VariablesTextAreaProps) {
	const variables = useMemo(() => {
		if (typeof value !== "string") return [];
		const matches = value.matchAll(/\{\{(.*?)\}\}/g);
		const vars = Array.from(matches).map((m) => m[1].trim());

		return Array.from(new Set(vars));
	}, [value]);

	return (
		<div className="flex flex-col gap-4 flex-1">
			<TextareaAutosize
				className={cn("outline-none w-full resize-none text-sm", className)}
				value={value}
				{...props}
			/>
			<div className="flex flex-wrap gap-1 items-center">
				{variables.map((variable) => (
					<Button
						color="warning"
						size="sm"
						key={variable}
						startContent={<LucideBraces className="size-3" />}
						className="gap-1 h-6 px-2"
						variant="flat"
						onPress={() => onVariablePress()}
					>
						{variable}
					</Button>
				))}
			</div>
		</div>
	);
}
