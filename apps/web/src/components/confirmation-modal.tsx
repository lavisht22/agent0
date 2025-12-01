import {
	Button,
	Modal,
	ModalBody,
	ModalContent,
	ModalFooter,
	ModalHeader,
} from "@heroui/react";

interface ConfirmationModalProps {
	isOpen: boolean;
	onOpenChange: () => void;
	title: string;
	description: string;
	onConfirm: () => void;
	isLoading?: boolean;
	confirmText?: string;
	cancelText?: string;
	confirmColor?: "primary" | "secondary" | "success" | "warning" | "danger";
}

export function ConfirmationModal({
	isOpen,
	onOpenChange,
	title,
	description,
	onConfirm,
	isLoading,
	confirmText = "Confirm",
	cancelText = "Cancel",
	confirmColor = "primary",
}: ConfirmationModalProps) {
	return (
		<Modal isOpen={isOpen} onOpenChange={onOpenChange}>
			<ModalContent>
				{(onClose) => (
					<>
						<ModalHeader className="flex flex-col gap-1">{title}</ModalHeader>
						<ModalBody>
							<p>{description}</p>
						</ModalBody>
						<ModalFooter>
							<Button color="danger" variant="light" onPress={onClose}>
								{cancelText}
							</Button>
							<Button
								color={confirmColor}
								onPress={onConfirm}
								isLoading={isLoading}
							>
								{confirmText}
							</Button>
						</ModalFooter>
					</>
				)}
			</ModalContent>
		</Modal>
	);
}
