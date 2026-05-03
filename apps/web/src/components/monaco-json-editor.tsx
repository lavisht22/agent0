import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTheme } from "@/lib/use-theme";

interface MonacoJsonEditorProps {
	value: string;
	onValueChange?: (value: string) => void;
	readOnly?: boolean;
	minHeight?: number;
	language?: string;
	// When true, the editor fills its parent's height instead of auto-sizing
	// to content (useful for long-form editing). Parent must give it height.
	fillHeight?: boolean;
}

/**
 * A Monaco-based editor with automatic theme switching. Defaults to JSON
 * with content-based auto-height; pass `language` and `fillHeight` to use
 * it for other languages (e.g. markdown) and long-form documents.
 */
export function MonacoJsonEditor({
	value,
	onValueChange,
	readOnly = false,
	minHeight = 100,
	language = "json",
	fillHeight = false,
}: MonacoJsonEditorProps) {
	const { theme: appTheme } = useTheme();
	const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
	const [editorHeight, setEditorHeight] = useState(minHeight);

	// Determine Monaco theme based on app theme
	const monacoTheme = useMemo(() => {
		if (appTheme === "dark") return "vs-dark";
		if (appTheme === "light") return "vs";
		// For "system", check the OS preference
		if (typeof window !== "undefined") {
			return window.matchMedia("(prefers-color-scheme: dark)").matches
				? "vs-dark"
				: "vs";
		}
		return "vs";
	}, [appTheme]);

	// Update editor height based on content
	const updateEditorHeight = useCallback(() => {
		if (editorRef.current) {
			const contentHeight = editorRef.current.getContentHeight();
			const newHeight = Math.max(minHeight, Math.min(contentHeight + 10, 500));
			setEditorHeight(newHeight);
		}
	}, [minHeight]);

	// Handle editor mount
	const handleEditorMount: OnMount = useCallback(
		(editor) => {
			editorRef.current = editor;

			if (fillHeight) return;

			// Update height on content change
			editor.onDidContentSizeChange(() => {
				updateEditorHeight();
			});

			// Initial height adjustment
			updateEditorHeight();
		},
		[updateEditorHeight, fillHeight],
	);

	// Handle content change
	const handleChange = useCallback(
		(newValue: string | undefined) => {
			if (!onValueChange || !newValue) return;

			onValueChange(newValue);
		},
		[onValueChange],
	);

	return (
		<div
			className="w-full overflow-hidden"
			style={fillHeight ? { height: "100%" } : { height: editorHeight }}
		>
			<Editor
				height="100%"
				language={language}
				theme={monacoTheme}
				value={value}
				onChange={handleChange}
				onMount={handleEditorMount}
				options={{
					readOnly,
					minimap: { enabled: false },
					scrollBeyondLastLine: false,
					fontSize: 13,
					lineNumbers: "off",
					folding: true,
					wordWrap: "on",
					automaticLayout: true,
					scrollbar: {
						vertical: "auto",
						horizontal: "auto",
						verticalScrollbarSize: 8,
						horizontalScrollbarSize: 8,
					},
					padding: { top: 8, bottom: 8 },
					renderLineHighlight: "none",
					overviewRulerLanes: 0,
					hideCursorInOverviewRuler: true,
					overviewRulerBorder: false,
					contextmenu: !readOnly,
					tabSize: 2,
				}}
			/>
		</div>
	);
}
