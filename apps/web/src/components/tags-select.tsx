import {
	Button,
	Input,
	InputGroup,
	Label,
	ListBox,
	Modal,
	Select,
	Spinner,
	TextField,
	useOverlayState,
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
	const state = useOverlayState();

	// State for new tag creation
	const [newTagName, setNewTagName] = useState("");
	const [selectedColor, setSelectedColor] = useState(getRandomColor);

	// Pre-select a random color when modal opens
	useEffect(() => {
		if (state.isOpen) {
			setSelectedColor(getRandomColor());
		}
	}, [state.isOpen]);

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
			state.close();
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
				selectionMode="multiple"
				value={selectedTags}
				onChange={(keys) => {
					onTagsChange(keys as string[]);
				}}
				isDisabled={!tags || tags.length === 0}
			>
				<Select.Trigger className="flex items-center gap-2">
					<LucideTag className="size-3.5 text-muted" />
					<Select.Value />

					<Select.Indicator />
				</Select.Trigger>
				<Select.Popover>
					<ListBox items={tags || []}>
						{(tag) => (
							<ListBox.Item id={tag.id} textValue={tag.name}>
								<TagChip name={tag.name} color={tag.color} />
								<ListBox.ItemIndicator />
							</ListBox.Item>
						)}
					</ListBox>
					{allowCreate && (
						<Button
							size="sm"
							variant="tertiary"
							className="w-full"
							onPress={state.open}
						>
							<LucidePlus className="size-3.5" />
							Create Tag
						</Button>
					)}
				</Select.Popover>
			</Select>

			{/* Create new tag modal - only rendered if allowCreate is true */}
			{allowCreate && (
				<Modal state={state}>
					<Modal.Backdrop>
						<Modal.Container size="sm">
							<Modal.Dialog>
								{({ close }) => (
									<>
										<Modal.Header>
											<Modal.Heading>Create Tag</Modal.Heading>
										</Modal.Header>
										<Modal.Body>
											<div className="flex flex-col gap-4">
												<TextField
													value={newTagName}
													onChange={setNewTagName}
													autoFocus
												>
													<Label>Tag Name</Label>
													<Input placeholder="e.g., Production, ChatBot, Support" />
												</TextField>
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
										</Modal.Body>
										<Modal.Footer>
											<Button variant="tertiary" onPress={close}>
												Cancel
											</Button>
											<Button
												variant="primary"
												onPress={handleCreateTag}
												isPending={createTagMutation.isPending}
												isDisabled={!newTagName.trim()}
											>
												{({ isPending }) => (
													<>
														{isPending && <Spinner color="current" size="sm" />}
														Create
													</>
												)}
											</Button>
										</Modal.Footer>
									</>
								)}
							</Modal.Dialog>
						</Modal.Container>
					</Modal.Backdrop>
				</Modal>
			)}
		</>
	);
}
