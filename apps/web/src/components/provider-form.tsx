import {
	Button,
	Card,
	Description,
	FieldError,
	Input,
	Label,
	ListBox,
	Select,
	Spinner,
	TextArea,
	TextField,
} from "@heroui/react";
import { useState } from "react";

export const PROVIDER_TYPES = [
	{ key: "xai", label: "XAI" },
	{ key: "vertex", label: "Vertex AI" },
	{ key: "anthropic-vertex", label: "Anthropic Vertex AI" },
	{ key: "gemini", label: "Google Gemini" },
	{ key: "openai", label: "OpenAI" },
	{ key: "azure_openai", label: "Azure OpenAI" },
];

interface ProviderFormProps {
	initialValues?: {
		name: string;
		type: string;
		data: Record<string, unknown>;
	};
	onSubmit: (values: {
		name: string;
		type: string;
		data: Record<string, unknown>;
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
		} catch (_e) {
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
			<Card.Header>
				<Card.Title className="text-xl font-bold">{title}</Card.Title>
			</Card.Header>
			<Card.Content>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<TextField name="name" isRequired>
						<Label>Name</Label>
						<Input
							autoFocus
							placeholder="e.g. My OpenAI Production"
							defaultValue={initialValues?.name}
						/>
					</TextField>
					<Select
						name="type"
						placeholder="Select a provider"
						defaultValue={initialValues?.type}
						isRequired
					>
						<Label>Provider Type</Label>
						<Select.Trigger>
							<Select.Value />
							<Select.Indicator />
						</Select.Trigger>
						<Select.Popover>
							<ListBox items={PROVIDER_TYPES}>
								{(type) => (
									<ListBox.Item id={type.key} textValue={type.label}>
										{type.label}
										<ListBox.ItemIndicator />
									</ListBox.Item>
								)}
							</ListBox>
						</Select.Popover>
					</Select>
					<TextField name="data" isRequired isInvalid={!!jsonError}>
						<Label>Configuration (JSON)</Label>
						<TextArea
							placeholder='{"apiKey": "..."}'
							defaultValue={
								initialValues ? JSON.stringify(initialValues.data, null, 2) : ""
							}
						/>
						<Description>
							Enter the provider configuration as a JSON object.
						</Description>
						{jsonError && <FieldError>{jsonError}</FieldError>}
					</TextField>
					<div className="flex justify-end gap-2 mt-4">
						<Button
							variant="tertiary"
							onPress={() => window.history.back()}
							isDisabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button variant="primary" type="submit" isPending={isSubmitting}>
							{({ isPending }) => (
								<>
									{isPending && <Spinner color="current" size="sm" />}
									Save Provider
								</>
							)}
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card>
	);
}
