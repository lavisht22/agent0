import { Button } from "@heroui/react";
import { LucideBraces } from "lucide-react";

export function Variables({
	variables,
	onVariablePress,
}: {
	variables: string[];
	onVariablePress: () => void;
}) {
	return (
		<div className="flex flex-wrap gap-1 items-center">
			{variables.map((variable) => (
				<Button
					size="sm"
					key={variable}
					className="gap-1 h-6 px-2 text-warning bg-warning-soft hover:bg-warning-soft-hover"
					variant="tertiary"
					onPress={() => onVariablePress()}
				>
					<LucideBraces className="size-3" />
					{variable}
				</Button>
			))}
		</div>
	);
}
