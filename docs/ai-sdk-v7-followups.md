# AI SDK v7 — deferred follow-ups

Tracking document for the two deprecation cleanups left over after the AI SDK
6 → 7 upgrade. Each is its own task and its own PR. Do them in the order below;
Task 1 is an afternoon, Task 2 is a real piece of work.

> **Neither task is required.** The app runs correctly on v7 today. Both old
> data shapes still work, held in place by the two compatibility decisions
> recorded below. Nothing here is blocking — these are cleanups you schedule,
> not breakage you chase.

---

## Where things stand

The upgrade itself is done: `ai@7`, all six provider packages on their v7-era
majors, `@ai-sdk/mcp@2`, and Node 24 across the Dockerfile, `engines` fields and
`@types/node`. All four packages typecheck and build.

Two v6 data shapes are still persisted in the database, and both are held
working by explicit compatibility decisions rather than by accident:

| v6 shape | Where it lives | What holds it working |
| --- | --- | --- |
| `{ role: "system" }` inside `messages` | `agent_versions.data.messages[0]` | `allowSystemInMessages: true` on all four SDK call sites |
| `{ type: "image", image, mediaType? }` | user message content parts in `agent_versions.data` | v7 still accepts `ImagePart`; it is deprecated, not removed |

Both were verified against the real v7 runtime with `MockLanguageModelV3` — see
[Appendix: verification harness](#appendix-verification-harness) to re-run any
of it.

### Not follow-ups (already fine)

Worth recording so nobody re-investigates these:

- **Tool output `media` parts** — `apps/web/src/components/tool-part.tsx` already
  accepts `{ type: "file-data" | "media" }`. v7 renamed `media` → `file-data`;
  the app handled both before the upgrade.
- **Assistant content parts** — `assistant-message.tsx` already uses `file`,
  never `image`.
- **CLI and SDK packages** — `packages/cli` passes messages through as
  `unknown[]`; `packages/agent0` types them as the SDK's own `ModelMessage[]`.
  Both follow the SDK automatically, no changes needed.
- **`GoogleGenerativeAIProviderOptions` → `GoogleLanguageModelOptions`** — a type
  rename only. The runtime JSON stored in `agent_versions.data.providerOptions`
  is unchanged.

### Known naming debt (not a task)

`RunData.totalUsage` in the run log store keeps its v6 name even though it is
now populated from v7's `result.usage`. Renaming the persisted key would split
old and new run blobs across two code paths for no user-visible gain, so it was
deliberately left alone. Same story for `runData.responseMessages`, which was
*added* during the upgrade with a fallback reader in
`_app.workspace.$workspaceId.runs.$runId.tsx` — old runs without the field fall
back to `steps[last].response.messages`. Don't remove that fallback until every
pre-upgrade run has aged out of retention.

---

## Task 1 — user message `image` parts → `file` parts

**Size:** one file. **Blocks nothing. Do this first.**

### Why

`ImagePart` is deprecated in v7. It still works — the SDK normalizes it to a
file part before the provider sees it — but each part emits a Node
`DeprecationWarning`, which on the runner means stderr noise on every run
carrying an image.

Verified: these two produce **byte-identical** provider payloads.

```ts
{ type: "image", image: PNG_BASE64, mediaType: "image/png" }
{ type: "file",  mediaType: "image/png", data: PNG_BASE64 }
// both arrive as:
// { type: "file", mediaType: "image/png", data: { type: "data", data: "…" } }
```

### The v7 shape

```ts
{ type: "file", mediaType: "image/png", data: <base64 | Uint8Array | URL | ref> }
```

`data` accepts a tagged shape or a bare shorthand:

| Tagged | Bare shorthand |
| --- | --- |
| `{ type: 'data', data }` | base64 string, `Uint8Array`, `ArrayBuffer`, `Buffer` |
| `{ type: 'url', url }` | a `URL` |
| `{ type: 'reference', reference }` | a `ProviderReference` from `uploadFile()` |
| `{ type: 'text', text }` | — (tagged only) |

**`mediaType` is required.** It was optional on `ImagePart`. Omitting it fails
schema validation outright:

```
AI_InvalidPromptError: The messages do not match the ModelMessage[] schema.
```

When the subtype is unknown, pass the top-level segment `"image"` — the SDK
refines it from the bytes. Verified: `mediaType: "image"` reaches the provider
as `image/png`.

### What to change

Everything lives in `apps/web/src/components/user-message.tsx` — it is the only
place in the repo that constructs or validates image parts.

1. **`handleFileSelect`** (~L186). The `if (file.type.startsWith("image/"))`
   branch and its `else` differ only in the key name (`image` vs `data`).
   Collapse both into one push:

   ```ts
   newContent.push({ type: "file", data: base64Data, mediaType: file.type });
   ```

2. **`handleEmbedSubmit`** (~L210). Same collapse. **Watch the media type:** the
   image branch currently passes `mediaType: embedMediaType || undefined`
   (~L217), which is legal on an image part and *invalid* on a file part. It
   must become `embedMediaType || "image"`.

3. **`userMessageSchema`** (~L36). Keep the `image` member of the zod union so
   existing stored versions still parse and render. Only stop *writing* it.

4. **The Image / File radio toggle** in the embed modal (~L352) becomes
   redundant once both paths produce a file part. Removing it is a product
   call, not a technical requirement — the media type field alone carries the
   distinction.

### Backward compatibility

No backfill and no DB migration. Old `{type:'image'}` rows keep working
because v7 still accepts them and the zod union still parses them; the
deprecation warnings drain naturally as versions get re-saved. Revisit removing
the `image` union member only once no live agent version contains one.

### Done when

- The editor writes only `file` parts for both images and non-images.
- An agent version saved *before* this change still loads, renders and runs.
- A version saved *after* it round-trips through save → run → run-detail view.
- No `DeprecationWarning: … "image" content part` in runner logs for a run
  whose version was saved post-change.

---

## Task 2 — system message → top-level `instructions`

**Size:** touches a feature, not just a shape. **Plan before starting.**

### Why

Not tidiness. v7's `instructions` accepts a full system message, not just a
string:

```ts
type Instructions = string | SystemModelMessage | Array<SystemModelMessage>;
```

which means the system prompt can carry its own `providerOptions` — so it can
hold a prompt-cache breakpoint:

```ts
instructions: {
  role: "system",
  content: "…",
  providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
}
```

`apps/runner/src/lib/prompt-cache.ts` cannot do this today, because the system
prompt is just another element of the `messages` array it marks the tail of.
**That caching win is the entire justification for this task.** If you don't
want it, don't do the task — `allowSystemInMessages: true` is a supported,
permanent option, not a temporary shim.

### What v7 changed

- Top-level `system` → `instructions`. `system` still exists but is
  `@deprecated`.
- `{ role: "system" }` inside `messages` now throws unless opted in:

  ```
  AI_InvalidPromptError: System messages are not allowed in the prompt or
  messages fields. Use the instructions option instead.
  ```

Verified: `allowSystemInMessages: true` and top-level `instructions` produce
identical provider prompts. The model sees the same thing either way — the
difference is purely where the system prompt lives in *our* data model.

### The ripple

`messages` stops being the single container for the prompt. Every one of these
assumes today that it isn't:

| Site | What it does today |
| --- | --- |
| `apps/runner/src/lib/types.ts` → `VersionData.messages` | type change, plus a backfill of every `agent_versions.data` row |
| `apps/runner/src/lib/helpers.ts` → `applySkillCatalog` (L423) | **merges the skill catalog into the leading system message, or prepends one** |
| `apps/runner/src/lib/run-agent.ts` → `assembleRun` (L356) | calls `applySkillCatalog`, then hands one array to the SDK |
| `run-agent.ts:546`, `test.ts:167`, `runs.ts:885`, `runs.ts:1151` | the four `allowSystemInMessages: true` call sites — each needs an `instructions` argument threaded in |
| `apps/web/src/components/system-message.tsx` | its own `role: z.literal("system")` schema and editor UI |
| `apps/web/src/components/messages.tsx` (L64) | renders the system role inline with the rest of the list |
| `.../agents.$agentId/index.tsx` (L177) | creates the system message when you start a new agent |
| `.../components/variables-drawer.tsx` (L65) | walks system messages to extract `{{variables}}` |

**The sharp edge is `applySkillCatalog`.** Skills are implemented *as* system
message manipulation — `prepareSkills` (`helpers.ts:367`) builds a catalog
string and `applySkillCatalog` splices it into message zero. That has to become
"append to instructions," which is straightforward but means this task modifies
the skills feature, not just prompt plumbing.

### Open questions to settle first

1. **Backfill or dual-read?** Backfilling `agent_versions.data` rewrites
   immutable version rows, which the 10-minute version cache TTL and the
   "versions are immutable once created" comment in `prepareRun` both assume
   won't happen. A dual-read (`data.instructions ?? extract from messages[0]`)
   avoids touching stored rows at the cost of a permanent compatibility branch.
   **Recommendation: dual-read.** Immutable rows should stay immutable.
2. **Does the editor keep showing the system prompt as "message zero"?** Users
   currently drag-reorder it alongside other messages. Moving it to a dedicated
   pinned field is the honest UI for `instructions`, but it is a visible change.
3. **Does the run-detail view need to change?** `runData.request.messages` is a
   persisted snapshot; if `instructions` becomes a sibling field it has to be
   rendered too, and old runs won't have it.
4. **Where does the cache breakpoint go once this lands?** Presumably
   `prompt-cache.ts` gains a second breakpoint on `instructions` while keeping
   the trailing-message one. Confirm the provider's breakpoint cap (Anthropic
   allows four) still holds.

### Done when

- `allowSystemInMessages` is gone from all four call sites.
- Skills still inject their catalog, verified by a run whose agent has a skill.
- An agent version saved before the change still loads, renders and runs.
- `prompt-cache.ts` sets a breakpoint on the system prompt, and a multi-step
  run still produces exactly one trailing breakpoint per request (see the
  harness below — this is the regression the upgrade already had to fix once).

---

## Appendix: verification harness

Every claim in this document was checked against the real v7 runtime rather
than the docs. The pattern: a `.mjs` file **inside `apps/runner/`** (so `ai`
resolves), driving `MockLanguageModelV3` and printing what the provider
actually received.

```js
import { generateText } from "ai";
import { MockLanguageModelV3 } from "ai/test";

const model = new MockLanguageModelV3({
  doGenerate: async ({ prompt }) => {
    console.log("provider saw:", JSON.stringify(prompt));
    return {
      finishReason: { unified: "stop" },          // NOTE: an object, not a string
      usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },  // nested
      content: [{ type: "text", text: "ok" }],
      warnings: [],
    };
  },
});

await generateText({ model, messages: [{ role: "user", content: "hi" }] });
```

Two shapes that will silently produce a useless mock if you get them wrong:

- `finishReason` is `{ unified: "stop" | "tool-calls" | … }`, **not** a bare
  string. A bare string yields `finishReason: undefined` and the tool loop
  terminates after one step with no tool events.
- `usage` is nested: `{ inputTokens: { total, noCache, cacheRead, cacheWrite },
  outputTokens: { total, text, reasoning } }`. Flat numbers yield an empty
  usage object.

To exercise the multi-step tool loop, have `doGenerate` return a `tool-call`
content part with `finishReason: { unified: "tool-calls" }` on the first call
and text with `{ unified: "stop" }` on the second. That setup is what confirmed
the prompt-cache breakpoint fix (one breakpoint per request across steps, not
an accumulating one per step) and that `responseMessages` holds the full
transcript while per-step `response.messages` no longer does.

Delete the scratch file when done — it should not land in the repo.
