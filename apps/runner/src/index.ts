import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import { registerRoutes } from "./routes/index.js";

// ESM fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Enable HTTP/2 (cleartext) when running behind a proxy that needs to propagate
// client cancellation via RST_STREAM — most notably GCP Cloud Run, whose
// HTTP/1.1 path silently holds the upstream connection open after the client
// disconnects, leaving `reply.raw` 'close' events un-fired. With h2c the
// frontend forwards stream resets immediately, so the abort wiring in routes/
// actually triggers. Off by default for local dev (browsers / Vite proxy can't
// talk h2c cleanly without TLS).
const useHttp2 = process.env.USE_HTTP2 === "true";

const fastify = Fastify({
	logger: true,
	bodyLimit: 50 * 1024 * 1024, // 50 MB
	...(useHttp2 ? { http2: true as const } : {}),
});

// 1. Register Static File Serving
fastify.register(fastifyStatic, {
	root: path.join(__dirname, "../public"), // Points to the copied web/dist folder
	prefix: "/", // Serve at root
});

// Wildcard CORS is for the cross-origin *machine* clients — the embed widget
// and API-key callers on customer sites. The browser app never relies on it:
// it's same-origin (prod serves the SPA; dev proxies through Vite), and its
// session rides a same-origin httpOnly cookie, not a CORS-readable header.
await fastify.register(cors, {
	origin: "*",
	methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
});

// Content-Security-Policy for the SPA document — the primary XSS mitigation now
// that the session cookie is httpOnly (an injected script can't read the token,
// and CSP makes injecting one much harder). It permits what our bundle actually
// needs: Monaco loads its editor + blob workers from the jsdelivr CDN and uses
// eval for its tokenizer, and HeroUI / React Aria inject inline styles.
// Tightening to nonces + a locally-bundled Monaco (dropping 'unsafe-eval' and
// the CDN) is a possible follow-up.
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
	// Cheap, universally-safe headers on every response.
	reply.header("X-Content-Type-Options", "nosniff");
	reply.header("Referrer-Policy", "no-referrer");

	// CSP + anti-framing only on the SPA document — not the JSON API, and not the
	// Swagger UI at /api/v1/docs (which ships its own inline init script this
	// policy would block).
	const contentType = reply.getHeader("content-type");
	const isHtml =
		typeof contentType === "string" && contentType.includes("text/html");
	if (isHtml && !(request.raw.url ?? "").startsWith("/api")) {
		reply.header("Content-Security-Policy", CONTENT_SECURITY_POLICY);
		reply.header("X-Frame-Options", "DENY");
	}

	return payload;
});

// 2. Catch-all for SPA (Single Page App) Routing
// If a user goes to /prompts/edit/123, Fastify shouldn't 404, it should serve index.html
fastify.setNotFoundHandler((req, reply) => {
	if (req.raw.url?.startsWith("/api")) {
		// If it's an actual API 404, return JSON
		reply.code(404).send({ error: "API endpoint not found" });
	} else {
		// Otherwise, return the App (Client-side routing handles the rest)
		reply.sendFile("index.html");
	}
});

// 3. Register Swagger
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

// 4. Register API Routes
await registerRoutes(fastify);

const start = async () => {
	try {
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
