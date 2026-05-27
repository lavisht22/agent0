#!/usr/bin/env node

/**
 * Test script for the RUN API
 *
 * Usage:
 *   node test-run-api.js <agent_id> <api_key> <workspace_id> [stream]
 *
 * Example:
 *   node test-run-api.js abc123 my-api-key ws_123 true
 */

const agent_id = process.argv[2];
const api_key = process.argv[3];
const workspace_id = process.argv[4];
const stream = process.argv[5] === "true";

if (!agent_id || !api_key || !workspace_id) {
	console.error("Usage: node test-run-api.js <agent_id> <api_key> <workspace_id> [stream]");
	process.exit(1);
}

const API_URL = `http://localhost:2223/api/v1/workspaces/${workspace_id}/runs`;

async function testRunAPI() {
	console.log("Testing RUN API...");
	console.log(`Agent ID: ${agent_id}`);
	console.log(`Stream: ${stream}`);
	console.log("---\n");

	try {
		const response = await fetch(API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": api_key,
			},
			body: JSON.stringify({
				agent_id,
				variables: {
					test_variable: "Hello from test script!",
				},
				stream,
			}),
		});

		console.log(`Status: ${response.status} ${response.statusText}\n`);

		if (!response.ok) {
			const error = await response.json();
			console.error("Error:", error);
			return;
		}

		if (stream) {
			console.log("Streaming response:\n");

			const reader = response.body.getReader();
			const decoder = new TextDecoder();

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value);
				const lines = chunk.split("\n");

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = JSON.parse(line.slice(6));
						console.log(JSON.stringify(data, null, 2));
					}
				}
			}
		} else {
			const data = await response.json();
			console.log("Non-streaming response:\n");
			console.log(JSON.stringify(data, null, 2));
		}
	} catch (error) {
		console.error("Error:", error.message);
	}
}

testRunAPI();
