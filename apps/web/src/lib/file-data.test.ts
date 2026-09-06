import { describe, expect, it } from "vitest";
import {
	formatBase64Size,
	imageSrc,
	isImageMediaType,
	resolveFileData,
} from "./file-data";

describe("resolveFileData", () => {
	it("reads AI SDK v7 tagged data", () => {
		expect(resolveFileData({ type: "data", data: "QUJD" })).toEqual({
			kind: "base64",
			value: "QUJD",
		});
		expect(
			resolveFileData({ type: "url", url: "https://example.com/a.png" }),
		).toEqual({ kind: "url", value: "https://example.com/a.png" });
		expect(resolveFileData({ type: "text", text: "hello" })).toEqual({
			kind: "text",
			value: "hello",
		});
	});

	it("reads the bare pre-v7 shapes", () => {
		expect(resolveFileData("QUJD")).toEqual({ kind: "base64", value: "QUJD" });
		expect(resolveFileData("data:image/png;base64,QUJD")).toEqual({
			kind: "url",
			value: "data:image/png;base64,QUJD",
		});
		expect(resolveFileData("https://example.com/a.png")).toEqual({
			kind: "url",
			value: "https://example.com/a.png",
		});
	});

	it("returns null for payloads it cannot display", () => {
		// A provider reference, raw bytes serialized as an object, and junk.
		expect(resolveFileData({ type: "reference", reference: { x: "1" } })).toBe(
			null,
		);
		expect(resolveFileData({ type: "data", data: { 0: 137, 1: 80 } })).toBe(
			null,
		);
		expect(resolveFileData(undefined)).toBe(null);
		expect(resolveFileData(42)).toBe(null);
	});
});

describe("isImageMediaType", () => {
	it("accepts full types and the bare v7 top-level segment", () => {
		expect(isImageMediaType("image/webp")).toBe(true);
		expect(isImageMediaType("image")).toBe(true);
		expect(isImageMediaType("application/pdf")).toBe(false);
		expect(isImageMediaType(undefined)).toBe(false);
		expect(isImageMediaType({ type: "data" })).toBe(false);
	});
});

describe("imageSrc", () => {
	it("passes URLs through and wraps base64 in a data URL", () => {
		expect(imageSrc({ kind: "url", value: "https://x/a.png" })).toBe(
			"https://x/a.png",
		);
		expect(imageSrc({ kind: "base64", value: "QUJD" }, "image/webp")).toBe(
			"data:image/webp;base64,QUJD",
		);
		// A top-level-segment media type carries no subtype to put in the URL.
		expect(imageSrc({ kind: "base64", value: "QUJD" }, "image")).toBe(
			"data:image/png;base64,QUJD",
		);
	});
});

describe("formatBase64Size", () => {
	it("formats KB and MB, and skips empty payloads", () => {
		expect(formatBase64Size("")).toBe(null);
		expect(formatBase64Size("a".repeat(4 * 1024 * 100))).toBe("300 KB");
		expect(formatBase64Size("a".repeat(4 * 1024 * 1024))).toBe("3.00 MB");
	});
});
