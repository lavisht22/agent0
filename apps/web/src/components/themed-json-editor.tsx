import { useTheme } from "@heroui/use-theme";
import {
	defaultTheme,
	githubDarkTheme,
	JsonEditor,
	type JsonEditorProps,
} from "json-edit-react";
import { useMemo } from "react";

/**
 * A themed wrapper around JsonEditor that automatically switches between
 * light (defaultTheme) and dark (githubDarkTheme) themes based on the
 * user's system/app preference.
 */
export function ThemedJsonEditor(props: JsonEditorProps) {
	const { theme: appTheme } = useTheme();

	// Determine if we should use dark mode
	// "dark" is explicit dark mode, "system" follows OS preference
	const isDarkMode = useMemo(() => {
		if (appTheme === "dark") return true;
		if (appTheme === "light") return false;
		// For "system", check the OS preference
		if (typeof window !== "undefined") {
			return window.matchMedia("(prefers-color-scheme: dark)").matches;
		}
		return false;
	}, [appTheme]);

	// Select the appropriate base theme
	const baseTheme = isDarkMode ? githubDarkTheme : defaultTheme;

	// Merge the base theme with custom overrides and any theme passed via props
	const mergedTheme = useMemo(() => {
		const customOverrides = {
			container: {
				backgroundColor: "transparent",
				fontSize: "12px",
			},
		};

		// If props.theme is provided, merge it as well
		if (props.theme) {
			if (Array.isArray(props.theme)) {
				return [baseTheme, customOverrides, ...props.theme];
			}
			return [baseTheme, customOverrides, props.theme];
		}

		return [baseTheme, customOverrides];
	}, [baseTheme, props.theme]);

	return (
		<JsonEditor
			key={isDarkMode ? "dark" : "light"}
			{...props}
			theme={mergedTheme}
		/>
	);
}
