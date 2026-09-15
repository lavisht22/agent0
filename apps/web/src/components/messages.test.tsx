// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Messages, type MessageT, normalizeMessages } from "./messages";

// The shape an MCP tool result takes on AI SDK v7: a `file` part whose `data`
// is the tagged `{ type: "data" }` union. Reading it as a bare base64 string
// (the pre-v7 shape) threw `startsWith is not a function` and blanked the
// whole run page.
const v7ImageResult = [
	{
		role: "assistant",
		content: [
			{
				type: "tool-call",
				toolCallId: "call_1",
				toolName: "read_asset",
				input: { id: "1" },
			},
		],
	},
	{
		role: "tool",
		content: [
			{
				type: "tool-result",
				toolCallId: "call_1",
				toolName: "read_asset",
				output: {
					type: "content",
					value: [
						{ type: "text", text: "here is the asset" },
						{
							type: "file",
							mediaType: "image/webp",
							data: { type: "data", data: "UklGRhRVAABXRUJQ" },
						},
					],
				},
			},
		],
	},
] as unknown as MessageT[];

function renderMessages(messages: MessageT[]) {
	return render(
		<Messages
			value={normalizeMessages(messages)}
			onValueChange={() => {}}
			isReadOnly
			onVariablePress={() => {}}
		/>,
	);
}

describe("read-only run messages", () => {
	it("renders a v7 tool result carrying an image file part", () => {
		renderMessages(v7ImageResult);

		expect(screen.getAllByText("read_asset").length).toBeGreaterThan(0);
	});

	// The editor stopped writing `image` parts when v7 deprecated them, but they
	// stay readable forever: old agent versions still hold them, and so does the
	// `request.messages` snapshot on every run recorded before the switch.
	it("still renders a legacy user image part alongside the file part that replaced it", () => {
		renderMessages([
			{
				id: "m1",
				role: "user",
				content: [
					{ type: "image", image: "QUJD", mediaType: "image/png" },
					{ type: "image", image: "QUJD" },
					{ type: "file", data: "QUJD", mediaType: "image/png" },
					{ type: "file", data: "QUJD", mediaType: "image" },
				],
			},
		] as unknown as MessageT[]);

		// Every part above is an image, so none should fall through to the
		// file-card branch that names the media type in text.
		expect(screen.getAllByAltText("Preview")).toHaveLength(4);
	});

	it("renders every other file-data shape without throwing", () => {
		const shapes = ["file-data", "media", "file"].flatMap((type) => [
			{ type, mediaType: "image/png", data: "QUJD" },
			{
				type,
				mediaType: "application/pdf",
				data: { type: "data", data: "QUJD" },
			},
			{
				type,
				mediaType: "image",
				data: { type: "url", url: "https://x/a.png" },
			},
			{ type, mediaType: "text/plain", data: { type: "text", text: "inline" } },
			{
				type,
				mediaType: "image/png",
				data: { type: "reference", reference: {} },
			},
			{ type, mediaType: undefined, data: undefined },
		]);

		expect(() =>
			renderMessages([
				{
					role: "tool",
					content: [
						{
							type: "tool-result",
							toolCallId: "call_1",
							toolName: "read_asset",
							output: { type: "content", value: shapes },
						},
					],
				},
			] as unknown as MessageT[]),
		).not.toThrow();
	});
});
