import {
	Button,
	Card,
	Chip,
	CloseButton,
	cn,
	Description,
	Drawer,
	Input,
	Label,
	TextArea,
	TextField,
	toast,
	useOverlayState,
} from "@heroui/react";
import { LucidePlus } from "lucide-react";
import { nanoid } from "nanoid";
import { useState } from "react";
import { MonacoJsonEditor } from "@/components/monaco-json-editor";
import type { Skill } from "../types";

interface SkillsSectionProps {
	value: Skill[];
	onValueChange: (value: Skill[]) => void;
	isInvalid?: boolean;
}

const EMPTY_FORM = { name: "", description: "", body: "" };

export default function SkillsSection({
	value,
	onValueChange,
	isInvalid,
}: SkillsSectionProps) {
	const drawerState = useOverlayState();

	// editingId === null means we're creating a new skill.
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState(EMPTY_FORM);

	const resetAndClose = () => {
		setForm(EMPTY_FORM);
		setEditingId(null);
		drawerState.close();
	};

	const openForCreate = () => {
		setForm(EMPTY_FORM);
		setEditingId(null);
		drawerState.open();
	};

	const openForEdit = (skill: Skill) => {
		setForm({
			name: skill.name,
			description: skill.description,
			body: skill.body,
		});
		setEditingId(skill.id);
		drawerState.open();
	};

	const handleRemove = (id: string) => {
		onValueChange(value.filter((s) => s.id !== id));
	};

	const handleSave = () => {
		const name = form.name.trim();
		const description = form.description.trim();
		const body = form.body;

		if (!name) {
			toast.danger("Skill name is required.");
			return;
		}
		if (!description) {
			toast.danger("Skill description is required.");
			return;
		}
		if (!body.trim()) {
			toast.danger("Skill body is required.");
			return;
		}

		// Name must be unique within the agent — read_skill uses it as the lookup key.
		const collision = value.find(
			(s) => s.name === name && s.id !== editingId,
		);
		if (collision) {
			toast.danger("A skill with this name already exists on this agent.");
			return;
		}

		if (editingId) {
			onValueChange(
				value.map((s) =>
					s.id === editingId ? { ...s, name, description, body } : s,
				),
			);
		} else {
			onValueChange([...value, { id: nanoid(), name, description, body }]);
		}

		resetAndClose();
	};

	const isEditing = editingId !== null;

	return (
		<>
			<Card className={isInvalid ? "border-danger border" : ""}>
				<Card.Header className="flex flex-row items-center justify-between">
					<span className="text-sm text-muted">Skills</span>
					<Button size="sm" variant="tertiary" isIconOnly onPress={openForCreate}>
						<LucidePlus className="size-3.5" />
					</Button>
				</Card.Header>
				<Card.Content>
					{value.length === 0 ? (
						<p className="text-sm text-muted">
							No skills attached. Click + to give this agent access to reusable
							skills.
						</p>
					) : (
						<div className="flex flex-wrap gap-2">
							{value.map((skill) => (
								<Chip
									key={skill.id}
									className="cursor-pointer"
									onClick={() => openForEdit(skill)}
								>
									<Chip.Label>{skill.name}</Chip.Label>
									<CloseButton
										aria-label="Remove skill"
										onPress={() => handleRemove(skill.id)}
									/>
								</Chip>
							))}
						</div>
					)}
				</Card.Content>
			</Card>

			<Drawer state={drawerState}>
				<Drawer.Backdrop>
					<Drawer.Content placement="right">
						<Drawer.Dialog style={{ width: 640, maxWidth: "85vw" }}>
							<Drawer.CloseTrigger />
							<Drawer.Header>
								<Drawer.Heading>
									{isEditing ? "Edit Skill" : "Add Skill"}
								</Drawer.Heading>
							</Drawer.Header>
							<Drawer.Body className="space-y-4">
								<TextField isRequired variant="secondary">
									<Label>Name</Label>
									<Input
										placeholder="e.g., write_changelog"
										value={form.name}
										onChange={(e) =>
											setForm((f) => ({ ...f, name: e.target.value }))
										}
									/>
									<Description>
										Unique identifier the model uses to load this skill.
									</Description>
								</TextField>

								<TextField isRequired variant="secondary">
									<Label>Description</Label>
									<TextArea
										placeholder="A short summary so the model knows when to read this skill."
										value={form.description}
										onChange={(e) =>
											setForm((f) => ({ ...f, description: e.target.value }))
										}
										rows={2}
									/>
									<Description>
										Shown to the model in the skill catalog. Keep it concise.
									</Description>
								</TextField>

								<div className="flex flex-col gap-1.5">
									<Label>
										Body (Markdown)
										<span className="text-danger ml-0.5">*</span>
									</Label>
									<div
										className={cn(
											"h-96 overflow-hidden border border-[var(--color-field-border)] bg-[var(--color-default)] transition-[background-color,border-color,box-shadow] duration-150",
											"rounded-[var(--field-radius,calc(var(--radius)*1.5))]",
											"focus-within:ring-2 focus-within:ring-[var(--focus)]",
											// Monaco paints its own background from its theme palette,
											// which won't match HeroUI's secondary-input bg. Override
											// the inline styles it injects on its internal containers.
											"[&_.monaco-editor]:!bg-[var(--color-default)]",
											"[&_.monaco-editor_.overflow-guard]:!bg-[var(--color-default)]",
											"[&_.monaco-editor_.monaco-editor-background]:!bg-[var(--color-default)]",
											"[&_.monaco-editor_.margin]:!bg-[var(--color-default)]",
										)}
									>
										<MonacoJsonEditor
											value={form.body}
											onValueChange={(v) =>
												setForm((f) => ({ ...f, body: v }))
											}
											language="markdown"
											fillHeight
										/>
									</div>
									<p className="ml-1 text-xs text-muted">
										Loaded verbatim when the model calls read_skill with this
										skill's name.
									</p>
								</div>
							</Drawer.Body>
							<Drawer.Footer>
								<Button variant="tertiary" onPress={resetAndClose}>
									Cancel
								</Button>
								<Button variant="primary" onPress={handleSave}>
									{isEditing ? "Save Changes" : "Add Skill"}
								</Button>
							</Drawer.Footer>
						</Drawer.Dialog>
					</Drawer.Content>
				</Drawer.Backdrop>
			</Drawer>
		</>
	);
}
