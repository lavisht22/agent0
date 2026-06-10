import { Button, Description, Dropdown, Label, Spinner } from "@heroui/react";
import { LucideChevronDown } from "lucide-react";
import type { Agent } from "@/lib/queries";

export function Action({
	isNewAgent,
	isSubmitting,
	canSubmit,
	isDirty,
	isMutationPending,
	handleSubmit,
	agent,
	versionId,
	deploy,
}: {
	isNewAgent: boolean;
	isSubmitting: boolean;
	isMutationPending: boolean;
	canSubmit: boolean;
	isDirty: boolean;
	handleSubmit: (data: unknown) => void;
	agent?: Agent;
	versionId?: string;
	deploy: (
		version_id: string,
		environment: "staging" | "production",
	) => Promise<void>;
}) {
	if (isNewAgent) {
		return (
			<Button
				size="sm"
				variant="primary"
				isPending={isSubmitting}
				isDisabled={!canSubmit}
				onPress={() => handleSubmit({})}
			>
				{({ isPending }) => (
					<>
						{isPending && <Spinner color="current" size="sm" />}
						Create
					</>
				)}
			</Button>
		);
	}

	const isLoading = isSubmitting || isMutationPending;

	const isDeployedToStaging = agent?.staging_version_id === versionId;
	const isDeployedToProduction = agent?.production_version_id === versionId;

	return (
		<>
			{isDirty && (
				<Button
					size="sm"
					variant="primary"
					isPending={isLoading}
					isDisabled={!canSubmit}
					onPress={() => handleSubmit({})}
				>
					{({ isPending }) => (
						<>
							{isPending && <Spinner color="current" size="sm" />}
							Save
						</>
					)}
				</Button>
			)}

			{!isDirty && (!isDeployedToProduction || !isDeployedToStaging) && (
				<Dropdown>
					<Button
						size="sm"
						variant="primary"
						isPending={isLoading}
						isDisabled={
							!canSubmit || (isDeployedToStaging && isDeployedToProduction)
						}
					>
						{({ isPending }) => (
							<>
								{isPending && <Spinner color="current" size="sm" />}
								Deploy
								<LucideChevronDown className="size-4" />
							</>
						)}
					</Button>
					<Dropdown.Popover placement="bottom end">
						<Dropdown.Menu
							aria-label="Deploy options"
							disabledKeys={[
								...(isDeployedToStaging ? ["staging"] : []),
								...(isDeployedToProduction ? ["production"] : []),
								...(isDeployedToStaging && isDeployedToProduction
									? ["both"]
									: []),
							]}
							onAction={async (key) => {
								if (!versionId) return;
								if (key === "staging") {
									await deploy(versionId, "staging");
								} else if (key === "production") {
									await deploy(versionId, "production");
								} else if (key === "both") {
									await deploy(versionId, "staging");
									await deploy(versionId, "production");
								}
							}}
						>
							<Dropdown.Item
								id="staging"
								textValue="To Staging"
								isDisabled={isDeployedToStaging}
							>
								<div className="size-3 rounded-full bg-warning" />
								<div className="flex flex-col">
									<Label>To Staging</Label>
									<Description>
										{isDeployedToStaging
											? "This version is already in staging"
											: "Deploy this version to staging"}
									</Description>
								</div>
							</Dropdown.Item>
							<Dropdown.Item
								id="production"
								textValue="To Production"
								isDisabled={isDeployedToProduction}
							>
								<div className="size-3 rounded-full bg-success" />
								<div className="flex flex-col">
									<Label>To Production</Label>
									<Description>
										{isDeployedToProduction
											? "This version is already in production"
											: "Deploy this version to production"}
									</Description>
								</div>
							</Dropdown.Item>
							<Dropdown.Item
								id="both"
								textValue="To Both"
								isDisabled={isDeployedToProduction && isDeployedToStaging}
							>
								<div className="flex">
									<div className="h-3 w-1.5 rounded-l-2xl bg-warning" />
									<div className="h-3 w-1.5 rounded-r-2xl bg-success" />
								</div>
								<div className="flex flex-col">
									<Label>To Both</Label>
									<Description>
										{isDeployedToStaging && isDeployedToProduction
											? "This version is already deployed to both"
											: "Deploy this version to staging and production"}
									</Description>
								</div>
							</Dropdown.Item>
						</Dropdown.Menu>
					</Dropdown.Popover>
				</Dropdown>
			)}
		</>
	);
}
