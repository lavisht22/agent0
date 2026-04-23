import { Button, Modal, Spinner } from "@heroui/react";

interface ConfirmationModalProps {
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	title: string;
	description: string;
	onConfirm: () => void;
	isLoading?: boolean;
	confirmText?: string;
	cancelText?: string;
	confirmColor?: "primary" | "secondary" | "success" | "warning" | "danger";
}

const variantForColor = (
	color: "primary" | "secondary" | "success" | "warning" | "danger",
) => {
	switch (color) {
		case "danger":
			return "danger" as const;
		case "secondary":
			return "secondary" as const;
		default:
			return "primary" as const;
	}
};

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
		<Modal>
			<Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
				<Modal.Container>
					<Modal.Dialog>
						{({ close }) => (
							<>
								<Modal.Header className="flex flex-col gap-1">
									<Modal.Heading>{title}</Modal.Heading>
								</Modal.Header>
								<Modal.Body>
									<p>{description}</p>
								</Modal.Body>
								<Modal.Footer>
									<Button variant="tertiary" onPress={close}>
										{cancelText}
									</Button>
									<Button
										variant={variantForColor(confirmColor)}
										onPress={onConfirm}
										isPending={isLoading}
									>
										{({ isPending }) => (
											<>
												{isPending && <Spinner color="current" size="sm" />}
												{confirmText}
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
	);
}
