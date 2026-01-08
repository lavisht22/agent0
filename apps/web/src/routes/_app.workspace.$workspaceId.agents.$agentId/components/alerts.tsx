import { Accordion, AccordionItem } from "@heroui/react";
import { LucideShieldAlert, LucideShieldX } from "lucide-react";

export function Alerts({
	warnings,
	errors,
}: {
	warnings: unknown[];
	errors: unknown[];
}) {
	return (
		<>
			{warnings.length > 0 && (
				<Accordion variant="splitted">
					{warnings.map((warning, index) => (
						<AccordionItem
							key={`${index + 1}`}
							classNames={{
								base: "bg-warning-50 bg",
								title: "text-warning-600 font-medium",
							}}
							title="Warning"
							startContent={
								<LucideShieldAlert className="size-4 text-warning-600" />
							}
						>
							<p className="whitespace-pre-wrap font-mono text-xs">
								{JSON.stringify(warning, null, 2)}
							</p>
						</AccordionItem>
					))}
				</Accordion>
			)}
			{errors.length > 0 && (
				<Accordion variant="splitted">
					{errors.map((error, index) => (
						<AccordionItem
							key={`${index + 1}`}
							classNames={{
								base: "bg-danger-50",
								title: "text-danger-600 font-medium",
							}}
							title="Error"
							startContent={
								<LucideShieldX className="size-4 text-danger-600" />
							}
						>
							<p className="whitespace-pre-wrap font-mono text-xs">
								{JSON.stringify(error, null, 2)}
							</p>
						</AccordionItem>
					))}
				</Accordion>
			)}
		</>
	);
}
