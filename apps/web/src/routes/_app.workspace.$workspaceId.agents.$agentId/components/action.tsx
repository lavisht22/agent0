import { Button, Description, Dropdown, Label, Spinner } from "@heroui/react";
import type { Tables } from "@repo/database";
import { LucideChevronDown } from "lucide-react";

export function Action({
	isNewAgent,
	isSubmitting,
	canSubmit,
	isDirty,
	isMutationPending,
	handleSubmit,
	agent,
	version,
	deploy,
}: {
	isNewAgent: boolean;
	isSubmitting: boolean;
	isMutationPending: boolean;
	canSubmit: boolean;
	isDirty: boolean;
	handleSubmit: (data: unknown) => void;
	agent?: Tables<"agents">;
	version?: Tables<"agent_versions">;
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

	// Check if current version is deployed to each environment
	const isDeployedToStaging = agent?.staging_version_id === version?.id;
	const isDeployedToProduction = agent?.production_version_id === version?.id;

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
					<Dropdown.Popover>
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
								if (!version) return;
								if (key === "staging") {
									await deploy(version.id, "staging");
								} else if (key === "production") {
									await deploy(version.id, "production");
								} else if (key === "both") {
									await deploy(version.id, "staging");
									await deploy(version.id, "production");
								}
							}}
						>
							<Dropdown.Item id="staging" textValue="To Staging">
								<Label>To Staging</Label>
								<Description>
									{isDeployedToStaging
										? "This version is already in staging"
										: "Deploy this version to staging"}
								</Description>
							</Dropdown.Item>
							<Dropdown.Item id="production" textValue="To Production">
								<Label>To Production</Label>
								<Description>
									{isDeployedToProduction
										? "This version is already in production"
										: "Deploy this version to production"}
								</Description>
							</Dropdown.Item>
							<Dropdown.Item id="both" textValue="To Both">
								<Label>To Both</Label>
								<Description>
									{isDeployedToStaging && isDeployedToProduction
										? "This version is already deployed to both"
										: "Deploy this version to staging and production"}
								</Description>
							</Dropdown.Item>
						</Dropdown.Menu>
					</Dropdown.Popover>
				</Dropdown>
			)}
		</>
	);
}
