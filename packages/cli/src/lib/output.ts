export interface OutputOpts {
	json?: boolean;
}

export function printJson(value: unknown, opts: OutputOpts = {}): void {
	const asJson = opts.json ?? !process.stdout.isTTY;
	if (asJson) {
		console.log(JSON.stringify(value));
	} else {
		console.log(JSON.stringify(value, null, 2));
	}
}
