import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { runMigrations } from "@repo/database/migrate";
import Fastify from "fastify";
import { registerRoutes } from "./routes/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Enable HTTP/2 (cleartext) behind a proxy that needs to propagate client
// cancellation via RST_STREAM — notably GCP Cloud Run, whose HTTP/1.1 path holds
// the upstream connection open after the client disconnects, leaving
// `reply.raw` 'close' events un-fired. With h2c the abort wiring in routes/
// actually triggers. Off for local dev (browsers / Vite proxy can't do h2c
// cleanly without TLS).
const useHttp2 = process.env.USE_HTTP2 === "true";

const fastify = Fastify({
	logger: true,
	bodyLimit: 50 * 1024 * 1024,
	...(useHttp2 ? { http2: true as const } : {}),
});

fastify.register(fastifyStatic, {
	root: path.join(__dirname, "../public"),
	prefix: "/",
});

// Wildcard CORS is for cross-origin *machine* clients — the embed widget and
// API-key callers on customer sites. The browser app never relies on it: it's
// same-origin and its session rides a same-origin httpOnly cookie.
await fastify.register(cors, {
	origin: "*",
	methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
});

// CSP for the SPA document — the primary XSS mitigation now that the session
// cookie is httpOnly. Permits what the bundle needs: Monaco loads its editor +
// blob workers from jsdelivr and uses eval for its tokenizer; HeroUI / React
// Aria inject inline styles.
const CONTENT_SECURITY_POLICY = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-eval' blob: https://cdn.jsdelivr.net",
	"worker-src 'self' blob:",
	"style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
	"img-src 'self' data: blob:",
	"font-src 'self' data: https://cdn.jsdelivr.net",
	"connect-src 'self' https://cdn.jsdelivr.net",
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"object-src 'none'",
].join("; ");

fastify.addHook("onSend", async (request, reply, payload) => {
	reply.header("X-Content-Type-Options", "nosniff");
	reply.header("Referrer-Policy", "no-referrer");

	// CSP + anti-framing only on the SPA document — not the JSON API, and not the
	// Swagger UI at /api/v1/docs (whose inline init script this policy would block).
	const contentType = reply.getHeader("content-type");
	const isHtml =
		typeof contentType === "string" && contentType.includes("text/html");
	if (isHtml && !(request.raw.url ?? "").startsWith("/api")) {
		reply.header("Content-Security-Policy", CONTENT_SECURITY_POLICY);
		reply.header("X-Frame-Options", "DENY");
	}

	return payload;
});

// Serve index.html for non-API paths so client-side routing handles deep links.
fastify.setNotFoundHandler((req, reply) => {
	if (req.raw.url?.startsWith("/api")) {
		reply.code(404).send({ error: "API endpoint not found" });
	} else {
		reply.sendFile("index.html");
	}
});

await fastify.register(fastifySwagger, {
	openapi: {
		info: {
			title: "agent0 API",
			description: "API for managing and running AI agents",
			version: "1.0.0",
		},
		components: {
			securitySchemes: {
				apiKey: {
					type: "apiKey",
					name: "x-api-key",
					in: "header",
					description: "Workspace API key",
				},
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "PAT",
					description: "Personal Access Token",
				},
			},
		},
		security: [{ apiKey: [] }, { bearerAuth: [] }],
	},
});

fastify.get("/api/v1/openapi.json", (req, reply) => {
	reply.send(fastify.swagger());
});

await fastify.register(fastifySwaggerUi, {
	routePrefix: "/api/v1/docs",
});

await registerRoutes(fastify);

const start = async () => {
	try {
		// Apply any pending DB migrations before serving. Idempotent and gated on
		// the `__drizzle_migrations` table, so it's a no-op once up to date.
		await runMigrations();
		fastify.log.info("database migrations up to date");

		await fastify.listen({
			port: Number(process.env.PORT || 2223),
			host: "0.0.0.0",
		});
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

start();
