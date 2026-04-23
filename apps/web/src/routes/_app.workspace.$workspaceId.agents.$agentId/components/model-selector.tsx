import {
	Button,
	Label,
	ListBox,
	Popover,
	useOverlayState,
} from "@heroui/react";
import { LucideServer } from "lucide-react";
import { useEffect, useState } from "react";
import { PROVIDER_TYPES } from "@/lib/providers";

interface Provider {
	id: string;
	name: string;
	type: string;
}

type Value = { provider_id: string; name: string };

interface ModelSelectorProps {
	value: Value;
	onValueChange: (value: Value) => void;
	providers: Provider[];
	isInvalid?: boolean;
}

export function ModelSelector({
	value,
	onValueChange,
	providers,
	isInvalid,
}: ModelSelectorProps) {
	const [selectedProvider, setSelectedProvider] = useState<string>("");
	const [selectedModel, setSelectedModel] = useState<string>("");
	const state = useOverlayState();

	const selectedProviderType = providers.find(
		(p) => p.id === selectedProvider,
	)?.type;

	const availableModels =
		PROVIDER_TYPES.find((p) => p.key === selectedProviderType)?.models || [];

	useEffect(() => {
		setSelectedProvider(value.provider_id);
		setSelectedModel(value.name);
	}, [value]);

	return (
		<Popover isOpen={state.isOpen} onOpenChange={state.setOpen}>
			<Button size="sm" variant={isInvalid ? "danger-soft" : "tertiary"}>
				<LucideServer className="size-3.5" />
				{value.name === ""
					? "Select Model"
					: `@${providers.find((p) => p.id === value.provider_id)?.name}/${value.name}`}
			</Button>
			<Popover.Content placement="bottom start">
				<Popover.Dialog className="p-2 flex flex-row items-start">
					<ListBox
						aria-label="Providers"
						selectionMode="single"
						className="w-52 max-h-64 overflow-y-auto"
						selectedKeys={selectedProvider ? [selectedProvider] : []}
						onSelectionChange={(keys) => {
							const selected = Array.from(keys)[0] as string;

							if (selected) {
								setSelectedProvider(selected);
								setSelectedModel("");
							}
						}}
					>
						{providers.map((provider) => {
							const providerType = PROVIDER_TYPES.find(
								(p) => p.key === provider.type,
							);

							return (
								<ListBox.Item
									key={provider.id}
									id={provider.id}
									textValue={provider.name}
								>
									{providerType?.icon && (
										<providerType.icon className="size-5" />
									)}
									<Label className="line-clamp-1">{provider.name}</Label>
									<ListBox.ItemIndicator />
								</ListBox.Item>
							);
						})}
					</ListBox>

					<ListBox
						aria-label="Models"
						selectionMode="single"
						className="w-64 max-h-64 overflow-y-auto"
						selectedKeys={selectedModel ? [selectedModel] : []}
						onSelectionChange={(keys) => {
							const selected = Array.from(keys)[0] as string;

							if (selected) {
								setSelectedModel(selected);

								onValueChange({
									provider_id: selectedProvider,
									name: selected,
								});

								state.close();
							}
						}}
					>
						{availableModels.map((model) => (
							<ListBox.Item key={model} id={model} textValue={model}>
								<Label>{model}</Label>
								<ListBox.ItemIndicator />
							</ListBox.Item>
						))}
					</ListBox>
				</Popover.Dialog>
			</Popover.Content>
		</Popover>
	);
}
