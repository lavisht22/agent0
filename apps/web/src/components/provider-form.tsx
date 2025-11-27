import {
	Button,
	Card,
	CardBody,
	CardHeader,
	Input,
	Select,
	SelectItem,
	Textarea,
} from "@heroui/react";
import { useState } from "react";

export const PROVIDER_TYPES = [
	{ key: "xai", label: "XAI" },
	{ key: "vertex", label: "Vertex AI" },
	{ key: "gemini", label: "Google Gemini" },
	{ key: "openai", label: "OpenAI" },
	{ key: "azure_openai", label: "Azure OpenAI" },
];

interface ProviderFormProps {
	initialValues?: {
		name: string;
		type: string;
		data: any;
	};
	onSubmit: (values: {
		name: string;
		type: string;
		data: any;
	}) => Promise<void>;
	isSubmitting: boolean;
	title: string;
}

export function ProviderForm({
	initialValues,
	onSubmit,
	isSubmitting,
	title,
}: ProviderFormProps) {
	const [jsonError, setJsonError] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setJsonError(null);
		const formData = new FormData(e.currentTarget);
		const dataStr = formData.get("data") as string;

		// biome-ignore lint/suspicious/noImplicitAnyLet: <We are parsing provider data>
		let parsedData;
		try {
			parsedData = JSON.parse(dataStr);
		} catch (e) {
			setJsonError("Invalid JSON configuration. Please check your input.");
			return;
		}

		await onSubmit({
			name: formData.get("name") as string,
			type: formData.get("type") as string,
			data: parsedData,
		});
	};

	return (
		<Card className="max-w-2xl mx-auto shadow-sm border border-gray-100">
			<CardHeader>
				<h1 className="text-xl font-bold">{title}</h1>
			</CardHeader>
			<CardBody>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<Input
						autoFocus
						label="Name"
						name="name"
						placeholder="e.g. My OpenAI Production"
						variant="bordered"
						defaultValue={initialValues?.name}
						isRequired
					/>
					<Select
						label="Provider Type"
						name="type"
						placeholder="Select a provider"
						variant="bordered"
						defaultSelectedKeys={initialValues ? [initialValues.type] : []}
						isRequired
					>
						{PROVIDER_TYPES.map((type) => (
							<SelectItem key={type.key}>{type.label}</SelectItem>
						))}
					</Select>
					<Textarea
						label="Configuration (JSON)"
						name="data"
						placeholder='{"apiKey": "..."}'
						variant="bordered"
						defaultValue={
							initialValues ? JSON.stringify(initialValues.data, null, 2) : ""
						}
						isRequired
						description="Enter the provider configuration as a JSON object."
						errorMessage={jsonError}
						isInvalid={!!jsonError}
					/>
					<div className="flex justify-end gap-2 mt-4">
						<Button
							variant="flat"
							onPress={() => window.history.back()}
							isDisabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button color="primary" type="submit" isLoading={isSubmitting}>
							Save Provider
						</Button>
					</div>
				</form>
			</CardBody>
		</Card>
	);
}
