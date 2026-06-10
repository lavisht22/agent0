import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";

/**
 * Run-log object store.
 *
 * Run logs (steps, request, error details, usage) are stored as one JSON object
 * per run, keyed by run id, on an S3-compatible backend (MinIO for self-hosting,
 * or any S3-compatible store). The endpoint and bucket are configured via the
 * `S3_*` env vars.
 */
export interface RunLogStore {
	/** Persist a run's log payload, keyed by run id. */
	put(id: string, data: unknown): Promise<void>;
	/** Fetch a run's log payload, or `null` if it no longer exists. */
	get(id: string): Promise<unknown | null>;
	/** Delete a run's log payload (no-op if already gone). */
	delete(id: string): Promise<void>;
}

const requireEnv = (name: string): string => {
	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} is not set (required for the S3 run-log store)`);
	}
	return value;
};

class S3RunLogStore implements RunLogStore {
	private readonly client: S3Client;
	private readonly bucket: string;

	constructor() {
		this.bucket = process.env.S3_BUCKET || "runs-data";
		this.client = new S3Client({
			endpoint: requireEnv("S3_ENDPOINT"),
			region: process.env.S3_REGION || "us-east-1",
			credentials: {
				accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
				secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
			},
			// Required for MinIO (no virtual-host-style buckets).
			forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
		});
	}

	async put(id: string, data: unknown): Promise<void> {
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: id,
				Body: JSON.stringify(data),
				ContentType: "application/json",
			}),
		);
	}

	async get(id: string): Promise<unknown | null> {
		try {
			const response = await this.client.send(
				new GetObjectCommand({ Bucket: this.bucket, Key: id }),
			);
			const text = await response.Body?.transformToString();
			return text ? JSON.parse(text) : null;
		} catch (error) {
			if (isNotFound(error)) {
				return null;
			}
			throw error;
		}
	}

	async delete(id: string): Promise<void> {
		await this.client.send(
			new DeleteObjectCommand({ Bucket: this.bucket, Key: id }),
		);
	}
}

const isNotFound = (error: unknown): boolean => {
	if (typeof error !== "object" || error === null) {
		return false;
	}
	const name = (error as { name?: string }).name;
	const status = (error as { $metadata?: { httpStatusCode?: number } })
		.$metadata?.httpStatusCode;
	return name === "NoSuchKey" || name === "NotFound" || status === 404;
};

export const runLogStore: RunLogStore = new S3RunLogStore();
