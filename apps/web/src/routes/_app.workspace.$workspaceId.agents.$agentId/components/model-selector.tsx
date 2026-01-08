import {
	Button,
	Listbox,
	ListboxItem,
	Popover,
	PopoverContent,
	PopoverTrigger,
	useDisclosure,
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
	const { isOpen, onOpenChange } = useDisclosure();

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
		<Popover
			placement="bottom-start"
			isOpen={isOpen}
			onOpenChange={onOpenChange}
		>
			<PopoverTrigger>
				<Button
					size="sm"
					variant="flat"
					color={isInvalid ? "danger" : "default"}
					startContent={<LucideServer className="size-3.5" />}
				>
					{value.name === ""
						? "Select Model"
						: `@${providers.find((p) => p.id === value.provider_id)?.name}/${value.name}`}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="p-2 flex flex-row items-start">
				<Listbox
					aria-label="Providers"
					variant="flat"
					emptyContent="You haven't created any providers."
					selectionMode="single"
					className="w-48 max-h-64 overflow-y-auto"
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
							<ListboxItem
								key={provider.id}
								startContent={
									providerType?.icon && <providerType.icon className="size-5" />
								}
								title={provider.name}
								// description={providerType?.label}
							/>
						);
					})}
				</Listbox>

				<Listbox
					aria-label="Models"
					variant="flat"
					emptyContent="Select a provider to see available models"
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

							onOpenChange();
						}
					}}
				>
					{availableModels.map((model) => (
						<ListboxItem key={model} title={model} />
					))}
				</Listbox>
			</PopoverContent>
		</Popover>
	);
}
