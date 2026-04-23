import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "heroui-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readStoredTheme(): Theme {
	if (typeof window === "undefined") return "system";
	const stored = window.localStorage.getItem(STORAGE_KEY);
	return stored === "light" || stored === "dark" || stored === "system"
		? stored
		: "system";
}

function applyTheme(theme: Theme) {
	if (typeof window === "undefined") return;
	const isDark =
		theme === "dark" ||
		(theme === "system" && window.matchMedia(DARK_QUERY).matches);
	document.documentElement.classList.toggle("dark", isDark);
}

export function useTheme() {
	const [theme, setThemeState] = useState<Theme>(readStoredTheme);

	useEffect(() => {
		applyTheme(theme);
		if (theme !== "system") return;
		const mq = window.matchMedia(DARK_QUERY);
		const onChange = () => applyTheme("system");
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [theme]);

	const setTheme = (next: Theme) => {
		window.localStorage.setItem(STORAGE_KEY, next);
		setThemeState(next);
	};

	return { theme, setTheme };
}
