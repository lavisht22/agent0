import { useTheme } from "@heroui/use-theme";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useMemo, useRef, useState } from "react";

interface MonacoJsonEditorProps {
	value: unknown;
	onChange?: (value: unknown) => void;
	readOnly?: boolean;
	minHeight?: number;
}

/**
 * A Monaco-based JSON editor with automatic theme switching,
 * auto-height adjustment, and validation.
 */
export function MonacoJsonEditor({
	value,
	onChange,
	readOnly = false,
	minHeight = 100,
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

	// Convert value to formatted JSON string
	const jsonString = useMemo(() => {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return "";
		}
	}, [value]);

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

			// Update height on content change
			editor.onDidContentSizeChange(() => {
				updateEditorHeight();
			});

			// Initial height adjustment
			updateEditorHeight();
		},
		[updateEditorHeight],
	);

	// Handle content change
	const handleChange = useCallback(
		(newValue: string | undefined) => {
			if (!onChange || !newValue) return;

			try {
				const parsed = JSON.parse(newValue);
				onChange(parsed);
			} catch {
				// Invalid JSON - don't update parent
			}
		},
		[onChange],
	);

	return (
		<div
			className="w-full rounded-lg overflow-hidden border border-default-200"
			style={{ height: editorHeight }}
		>
			<Editor
				height="100%"
				language="json"
				theme={monacoTheme}
				value={jsonString}
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
