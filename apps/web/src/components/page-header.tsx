import { Breadcrumbs, cn } from "@heroui/react";
import { type LinkProps, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

export interface BreadcrumbItem {
	label: ReactNode;
	to?: LinkProps["to"];
	params?: LinkProps["params"];
	search?: LinkProps["search"];
}

interface PageHeaderProps {
	breadcrumbs: BreadcrumbItem[];
	children?: ReactNode;
	className?: string;
}

export function PageHeader({
	breadcrumbs,
	children,
	className,
}: PageHeaderProps) {
	const router = useRouter();

	return (
		<div
			className={cn(
				"shrink-0 flex justify-between items-center gap-4 h-16 border-b border-border box-content px-4",
				className,
			)}
		>
			<Breadcrumbs
				className={cn(
					"min-w-0",
					"[&_.breadcrumbs__link]:text-lg",
					"[&_.breadcrumbs__link]:font-medium",
					"[&_.breadcrumbs__link]:tracking-tight",
				)}
			>
				{breadcrumbs.map((item, index) => {
					const isLast = index === breadcrumbs.length - 1;
					const href =
						!isLast && item.to
							? router.buildLocation({
									to: item.to,
									params: item.params,
									search: item.search,
								} as Parameters<typeof router.buildLocation>[0]).href
							: undefined;

					return (
						<Breadcrumbs.Item
							key={`${item.label}-${href ?? "current"}`}
							href={href}
							className="truncate"
						>
							{item.label}
						</Breadcrumbs.Item>
					);
				})}
			</Breadcrumbs>
			{children && (
				<div className="flex items-center gap-2 shrink-0">{children}</div>
			)}
		</div>
	);
}
