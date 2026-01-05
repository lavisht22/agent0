import {
	Button,
	Input,
	Modal,
	ModalBody,
	ModalContent,
	ModalFooter,
	ModalHeader,
	Select,
	SelectItem,
	useDisclosure,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LucidePlus, LucideTag } from "lucide-react";
import { nanoid } from "nanoid";
import { useEffect, useState } from "react";
import { tagsQuery } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { TagChip } from "./tag-chip";

// Predefined color palette for tags
const TAG_COLORS = [
	"#ef4444", // red
	"#f97316", // orange
	"#eab308", // yellow
	"#22c55e", // green
	"#14b8a6", // teal
	"#0ea5e9", // sky
	"#6366f1", // indigo
	"#8b5cf6", // violet
	"#d946ef", // fuchsia
	"#ec4899", // pink
	"#84cc16", // lime
	"#06b6d4", // cyan
	"#10b981", // emerald
	"#f43f5e", // rose
	"#f59e0b", // amber
	"#64748b", // slate
];

// Helper function to get a random color
const getRandomColor = () =>
	TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];

interface TagsSelectProps {
	workspaceId: string;
	selectedTags: string[];
	onTagsChange: (tags: string[]) => void;
	/** If true, shows "Create Tag" option in the dropdown */
	allowCreate?: boolean;
}

export function TagsSelect({
	workspaceId,
	selectedTags,
	onTagsChange,
	allowCreate = false,
}: TagsSelectProps) {
	const queryClient = useQueryClient();
	const { data: tags } = useQuery(tagsQuery(workspaceId));
	const { isOpen, onOpen, onOpenChange } = useDisclosure();

	// State for new tag creation
	const [newTagName, setNewTagName] = useState("");
	const [selectedColor, setSelectedColor] = useState(getRandomColor);

	// Pre-select a random color when modal opens
	useEffect(() => {
		if (isOpen) {
			setSelectedColor(getRandomColor());
		}
	}, [isOpen]);

	// Get selected tag objects for rendering
	const selectedTagObjects = tags?.filter((tag) =>
		selectedTags.includes(tag.id),
	);

	// Create new tag mutation
	const createTagMutation = useMutation({
		mutationFn: async ({ name, color }: { name: string; color: string }) => {
			const tagId = nanoid();

			const { error } = await supabase.from("tags").insert({
				id: tagId,
				name,
				color,
				workspace_id: workspaceId,
			});

			if (error) throw error;

			return tagId;
		},
		onSuccess: (tagId) => {
			queryClient.invalidateQueries({ queryKey: ["tags", workspaceId] });
			onTagsChange([...selectedTags, tagId]);
			setNewTagName("");
			onOpenChange();
		},
	});

	const handleCreateTag = () => {
		if (!newTagName.trim()) return;
		createTagMutation.mutate({ name: newTagName.trim(), color: selectedColor });
	};

	return (
		<>
			<Select
				aria-label="Select tags"
				placeholder="Tags"
				size="sm"
				listboxProps={{
					variant: "flat",
					bottomContent: allowCreate ? (
						<Button
							size="sm"
							variant="light"
							className="w-full"
							onPress={onOpen}
							startContent={<LucidePlus className="size-3.5" />}
						>
							Create Tag
						</Button>
					) : undefined,
				}}
				selectionMode="multiple"
				isMultiline
				startContent={<LucideTag className="size-3.5 text-default-500" />}
				selectedKeys={new Set(selectedTags)}
				onSelectionChange={(keys) => {
					const newTags = Array.from(keys) as string[];
					onTagsChange(newTags);
				}}
				items={tags || []}
				isDisabled={!tags || tags.length === 0}
				renderValue={() => {
					if (!selectedTagObjects || selectedTagObjects.length === 0) {
						return <span className="text-default-500">Tags</span>;
					}

					return (
						<div className="flex gap-1 flex-wrap">
							{selectedTagObjects.map((tag) => (
								<TagChip
									key={tag.id}
									name={tag.name}
									color={tag.color}
									onRemove={() => {
										onTagsChange(selectedTags.filter((id) => id !== tag.id));
									}}
								/>
							))}
						</div>
					);
				}}
			>
				{(tag) => (
					<SelectItem key={tag.id} textValue={tag.name}>
						<TagChip name={tag.name} color={tag.color} />
					</SelectItem>
				)}
			</Select>

			{/* Create new tag modal - only rendered if allowCreate is true */}
			{allowCreate && (
				<Modal isOpen={isOpen} onOpenChange={onOpenChange} size="sm">
					<ModalContent>
						{(onClose) => (
							<>
								<ModalHeader>Create Tag</ModalHeader>
								<ModalBody>
									<div className="flex flex-col gap-4">
										<Input
											label="Tag Name"
											placeholder="e.g., Production, ChatBot, Support"
											value={newTagName}
											onValueChange={setNewTagName}
											autoFocus
										/>
										<div className="flex flex-col gap-2">
											<span className="text-sm font-medium">Color</span>
											<div className="flex flex-wrap gap-2">
												{TAG_COLORS.map((color) => (
													<button
														key={color}
														type="button"
														className={`w-8 h-8 rounded-full border-2 transition-all ${
															selectedColor === color
																? "border-foreground scale-110"
																: "border-transparent hover:scale-105"
														}`}
														style={{ backgroundColor: color }}
														onClick={() => setSelectedColor(color)}
													/>
												))}
											</div>
										</div>
										{newTagName && (
											<div className="flex items-center gap-2">
												<span className="text-sm text-default-500">
													Preview:
												</span>
												<TagChip name={newTagName} color={selectedColor} />
											</div>
										)}
									</div>
								</ModalBody>
								<ModalFooter>
									<Button variant="light" onPress={onClose}>
										Cancel
									</Button>
									<Button
										color="primary"
										onPress={handleCreateTag}
										isLoading={createTagMutation.isPending}
										isDisabled={!newTagName.trim()}
									>
										Create
									</Button>
								</ModalFooter>
							</>
						)}
					</ModalContent>
				</Modal>
			)}
		</>
	);
}
