import {
	Button,
	Dropdown,
	DropdownItem,
	DropdownMenu,
	DropdownTrigger,
} from "@heroui/react";
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
	version?: Tables<"versions">;
	deploy: (
		version_id: string,
		environment: "staging" | "production",
	) => Promise<void>;
}) {
	if (isNewAgent) {
		return (
			<Button
				size="sm"
				color="primary"
				isLoading={isSubmitting}
				isDisabled={!canSubmit}
				onPress={() => handleSubmit({})}
			>
				Create
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
					color="primary"
					isLoading={isLoading}
					isDisabled={!canSubmit}
					onPress={() => handleSubmit({})}
				>
					Save
				</Button>
			)}

			{!isDirty && (!isDeployedToProduction || !isDeployedToStaging) && (
				<Dropdown placement="bottom-end">
					<DropdownTrigger>
						<Button
							size="sm"
							color="primary"
							isLoading={isLoading}
							isDisabled={
								!canSubmit || (isDeployedToStaging && isDeployedToProduction)
							}
							endContent={<LucideChevronDown className="size-4" />}
						>
							Deploy
						</Button>
					</DropdownTrigger>
					<DropdownMenu
						variant="flat"
						aria-label="Deploy options"
						disabledKeys={[
							...(isDeployedToStaging ? ["staging"] : []),
							...(isDeployedToProduction ? ["production"] : []),
							...(isDeployedToStaging && isDeployedToProduction
								? ["both"]
								: []),
						]}
					>
						<DropdownItem
							key="staging"
							color="warning"
							description={
								isDeployedToStaging
									? "This version is already in staging"
									: "Deploy this version to staging"
							}
							onPress={async () => {
								if (version) {
									await deploy(version.id, "staging");
								}
							}}
						>
							To Staging
						</DropdownItem>
						<DropdownItem
							key="production"
							color="success"
							description={
								isDeployedToProduction
									? "This version is already in production"
									: "Deploy this version to production"
							}
							onPress={async () => {
								if (version) {
									await deploy(version.id, "production");
								}
							}}
						>
							To Production
						</DropdownItem>
						<DropdownItem
							key="both"
							color="primary"
							description={
								isDeployedToStaging && isDeployedToProduction
									? "This version is already deployed to both"
									: "Deploy this version to staging and production"
							}
							onPress={async () => {
								if (version) {
									await deploy(version.id, "staging");
									await deploy(version.id, "production");
								}
							}}
						>
							To Both
						</DropdownItem>
					</DropdownMenu>
				</Dropdown>
			)}
		</>
	);
}
