import { Alert } from "@heroui/react";
import { Component, type ReactNode } from "react";

/**
 * Contains a render failure to one section of a page.
 *
 * Run logs are provider output replayed months later, so an unexpected part
 * shape is always possible. Without a boundary one bad part takes down the
 * whole run view; with it the rest of the run — including View Raw — still
 * renders.
 */
export class ErrorBoundary extends Component<
	{ title: string; children: ReactNode },
	{ error: Error | null }
> {
	state: { error: Error | null } = { error: null };

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	componentDidCatch(error: Error) {
		console.error(error);
	}

	render() {
		if (this.state.error) {
			return (
				<Alert status="danger">
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>{this.props.title}</Alert.Title>
						<Alert.Description>
							{this.state.error.message} — use View Raw to inspect the data.
						</Alert.Description>
					</Alert.Content>
				</Alert>
			);
		}

		return this.props.children;
	}
}
