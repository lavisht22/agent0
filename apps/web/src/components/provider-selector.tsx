import {
	Button,
	Divider,
	Popover,
	PopoverContent,
	PopoverTrigger,
	Select,
	SelectItem,
} from "@heroui/react";
import { LucidePlus, LucideServer, LucideTrash2 } from "lucide-react";
import { useState } from "react";
import { PROVIDER_TYPES } from "@/lib/providers";

interface Provider {
	id: string;
	name: string;
	type: string;
}

type Value = { id: string; model: string }[];

interface ProviderSelectorProps {
	value: Value;
	onChange: (value: Value) => void;
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

	const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
	const [selectedModel, setSelectedModel] = useState<string | null>(null);

	const selectedProviderType = providers.find(
		(p) => p.id === selectedProvider,
	)?.type;
	const availableModels =
		PROVIDER_TYPES.find((p) => p.key === selectedProviderType)?.models || [];

	return (
		<Popover placement="bottom-start" isOpen={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger>
				<Button
					size="sm"
					variant="flat"
					color={isInvalid ? "danger" : "default"}
					startContent={<LucideServer className="size-3.5" />}
				>
					{value.length === 0
						? "Select Provider"
						: value.length === 1
							? `@${providers.find((p) => p.id === value[0].id)?.name}/${value[0].model}`
							: "Multiple Providers"}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="p-3 flex flex-row">
				<div className="w-96 space-y-4">
					<div className="space-y-2">
						{value.length === 0 && (
							<p className="p-2 text-default-500 text-sm text-center">
								No providers selected
							</p>
						)}

						{value.map((item, index) => {
							const provider = providers.find((p) => p.id === item.id);

							if (!provider) return null;

							return (
								<div key={provider.id} className="flex gap-1 items-center">
									<p className="p-2 bg-default-100 rounded-xl flex-1">
										@{provider.name}/{item.model}
									</p>
									<Button
										variant="light"
										size="sm"
										isIconOnly
										onPress={() => {
											const newList = [...value];
											newList.splice(index, 1);

											onChange(newList);
										}}
									>
										<LucideTrash2 className="size-3.5" />
									</Button>
								</div>
							);
						})}
					</div>
					<Divider />
					<div className="space-y-2">
						<div className="flex gap-2 items-center">
							<Select
								variant="bordered"
								size="sm"
								aria-label="Provider"
								placeholder="Provider"
								selectedKeys={selectedProvider ? [selectedProvider] : []}
								onSelectionChange={(keys) => {
									const selected = Array.from(keys)[0] as string;

									if (selected) {
										setSelectedProvider(selected);
									}
								}}
							>
								{providers.map((provider) => (
									<SelectItem key={provider.id}>{provider.name}</SelectItem>
								))}
							</Select>
							<Select
								variant="bordered"
								size="sm"
								aria-label="Model"
								placeholder="Model"
								isDisabled={!selectedProvider}
								selectedKeys={selectedModel ? [selectedModel] : []}
								onSelectionChange={(keys) => {
									const selected = Array.from(keys)[0] as string;

									if (selected) {
										setSelectedModel(selected);
									}
								}}
							>
								{availableModels
									.filter(
										(model) =>
											!value.some(
												(item) =>
													item.model === model && item.id === selectedProvider,
											),
									)
									.map((model) => (
										<SelectItem key={model}>{model}</SelectItem>
									))}
							</Select>
						</div>
						{selectedProvider && selectedModel && (
							<Button
								fullWidth
								variant="flat"
								color="primary"
								size="sm"
								startContent={<LucidePlus className="size-3.5" />}
								isDisabled={!selectedProvider || !selectedModel}
								onPress={() => {
									if (!selectedProvider || !selectedModel) return;

									onChange([
										...value,
										{ id: selectedProvider, model: selectedModel },
									]);

									setSelectedProvider(null);
									setSelectedModel(null);
								}}
							>
								Add
							</Button>
						)}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
