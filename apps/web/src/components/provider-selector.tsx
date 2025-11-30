import {
	Button,
	Listbox,
	ListboxItem,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@heroui/react";
import { useEffect, useState } from "react";
import { PROVIDER_TYPES } from "@/lib/providers";

interface Provider {
	id: string;
	name: string;
	type: string;
}

interface ProviderSelectorProps {
	value: { id: string; model: string };
	onChange: (value: { id: string; model: string }) => void;
	providers: Provider[];
	isInvalid?: boolean;
}

export function ProviderSelector({
	value,
	onChange,
	providers,
	isInvalid,
}: ProviderSelectorProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [internalProviderId, setInternalProviderId] = useState(value.id);
	const [internalModel, setInternalModel] = useState(value.model);

	// Sync internal state with props when popover opens
	useEffect(() => {
		if (isOpen) {
			setInternalProviderId(value.id);
			setInternalModel(value.model);
		}
	}, [isOpen, value.id, value.model]);

	const selectedProvider = providers.find((p) => p.id === internalProviderId);
	const availableModels =
		PROVIDER_TYPES.find((p) => p.key === selectedProvider?.type)?.models || [];

	const currentProvider = providers.find((p) => p.id === value.id);

	return (
		<Popover placement="bottom-start" isOpen={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger>
				<Button
					size="sm"
					variant="flat"
					color={isInvalid ? "danger" : "default"}
				>
					{currentProvider
						? `@${currentProvider.name}/${value.model}`
						: "Select Provider"}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="p-2 flex flex-row">
				<div className="w-36 h-64 border-r border-default-200 overflow-y-scroll">
					<Listbox
						selectionMode="single"
						selectedKeys={internalProviderId ? [internalProviderId] : []}
						onSelectionChange={(keys) => {
							const selected = Array.from(keys)[0] as string;
							if (selected) {
								setInternalProviderId(selected);
								setInternalModel(""); // Clear model when provider changes
							}
						}}
						variant="flat"
					>
						{providers.map((provider) => (
							<ListboxItem key={provider.id}>{provider.name}</ListboxItem>
						))}
					</Listbox>
				</div>
				<div className="w-56 h-64 overflow-y-scroll">
					<Listbox
						selectionMode="single"
						selectedKeys={internalModel ? [internalModel] : []}
						onSelectionChange={(keys) => {
							const selected = Array.from(keys)[0] as string;
							if (selected) {
								setInternalModel(selected);
								onChange({
									id: internalProviderId,
									model: selected,
								});
								setIsOpen(false);
							}
						}}
						variant="flat"
					>
						{availableModels.map((model) => (
							<ListboxItem key={model}>{model}</ListboxItem>
						))}
					</Listbox>
				</div>
			</PopoverContent>
		</Popover>
	);
}
