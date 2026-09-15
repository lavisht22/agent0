// @vitest-environment jsdom
import { fireEvent, render, waitFor } from "@testing-library/react";
import { Reorder } from "framer-motion";
import { describe, expect, it, vi } from "vitest";
import { UserMessage, type UserMessageT } from "./user-message";

const base: UserMessageT = {
	id: "m1",
	role: "user",
	content: [{ type: "text", text: "hello" }],
};

function renderUserMessage(onValueChange: (v: UserMessageT | null) => void) {
	const { container } = render(
		// UserMessage is a Reorder.Item and needs a group around it.
		<Reorder.Group axis="y" values={[base]} onReorder={() => {}}>
			<UserMessage
				value={base}
				onValueChange={onValueChange}
				onVariablePress={() => {}}
			/>
		</Reorder.Group>,
	);

	const input = container.querySelector('input[type="file"]');
	if (!(input instanceof HTMLInputElement)) throw new Error("no file input");

	return input;
}

describe("user message file upload", () => {
	it("accepts multiple files in one selection", async () => {
		const onValueChange = vi.fn();
		const input = renderUserMessage(onValueChange);

		expect(input.multiple).toBe(true);

		fireEvent.change(input, {
			target: {
				files: [
					new File(["one"], "a.png", { type: "image/png" }),
					new File(["two"], "b.pdf", { type: "application/pdf" }),
				],
			},
		});

		await waitFor(() => expect(onValueChange).toHaveBeenCalledTimes(1));

		// A single update carrying every file: appending one at a time would
		// read the stale `value` prop and drop all but the last.
		expect(onValueChange.mock.calls[0][0].content).toEqual([
			base.content[0],
			{ type: "file", data: expect.any(String), mediaType: "image/png" },
			{ type: "file", data: expect.any(String), mediaType: "application/pdf" },
		]);
	});

	it("falls back to a generic media type when the browser reports none", async () => {
		const onValueChange = vi.fn();
		const input = renderUserMessage(onValueChange);

		fireEvent.change(input, {
			target: { files: [new File(["x"], "LICENSE", { type: "" })] },
		});

		await waitFor(() => expect(onValueChange).toHaveBeenCalledTimes(1));

		// `mediaType` is optional on a legacy `image` part but required on a
		// `file` part, so an extensionless upload needs something here.
		expect(onValueChange.mock.calls[0][0].content[1]).toMatchObject({
			type: "file",
			mediaType: "application/octet-stream",
		});
	});
});
