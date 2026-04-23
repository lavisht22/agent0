import { Accordion } from "@heroui/react";
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
				<Accordion>
					{warnings.map((warning, index) => (
						<Accordion.Item
							key={`${index + 1}`}
							id={`${index + 1}`}
							className="bg-warning-50"
						>
							<Accordion.Heading>
								<Accordion.Trigger>
									<LucideShieldAlert className="size-4 text-warning-600" />
									<span className="text-warning-600 font-medium">Warning</span>
									<Accordion.Indicator />
								</Accordion.Trigger>
							</Accordion.Heading>
							<Accordion.Panel>
								<Accordion.Body>
									<p className="whitespace-pre-wrap font-mono text-xs">
										{JSON.stringify(warning, null, 2)}
									</p>
								</Accordion.Body>
							</Accordion.Panel>
						</Accordion.Item>
					))}
				</Accordion>
			)}
			{errors.length > 0 && (
				<Accordion>
					{errors.map((error, index) => (
						<Accordion.Item
							key={`${index + 1}`}
							id={`${index + 1}`}
							className="bg-danger-50"
						>
							<Accordion.Heading>
								<Accordion.Trigger>
									<LucideShieldX className="size-4 text-danger-600" />
									<span className="text-danger-600 font-medium">Error</span>
									<Accordion.Indicator />
								</Accordion.Trigger>
							</Accordion.Heading>
							<Accordion.Panel>
								<Accordion.Body>
									<p className="whitespace-pre-wrap font-mono text-xs">
										{JSON.stringify(error, null, 2)}
									</p>
								</Accordion.Body>
							</Accordion.Panel>
						</Accordion.Item>
					))}
				</Accordion>
			)}
		</>
	);
}
