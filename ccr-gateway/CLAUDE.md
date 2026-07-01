# CLAUDE.md — Web API Gateway

> Loaded automatically by Claude Code and AI coding agents.
> Defines the rules of this repo. Follow these before writing a single line.
> **Do not override without explicit instruction from the project owner.**

---

## Project Identity

- **Project:** ccr-gateway (Claude Code Router Gateway)
- **Type:** API Gateway / Backend Service
- **Owner:** XSC/CXO Pre-sales Team
- **Repo:** Antigravity
- **Live URL:** N/A (local development gateway)
- **Staging URL:** N/A

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend Framework | N/A (API-only) | N/A |
| Styling | N/A | N/A |
| Language | TypeScript | 5.5.2 |
| Backend | Fastify | 4.28.1 |
| Database | JSON file (ccr_database.json) | - |
| Auth | API Key / Bearer Token | Custom |
| Hosting | Local / Development | - |
| Package Manager | npm | - |

### Key Dependencies

- `fastify` - Web framework
- `@aws-sdk/client-bedrock-runtime` - AWS Bedrock integration
- `@aws-sdk/credential-providers` - AWS credentials
- `undici` - HTTP client
- `pg` - PostgreSQL client
- `uuid` - UUID generation
- `tsx` - TypeScript execution

---

## Folder Structure

```
ccr-gateway/
├── src/
│   ├── components/       # (No components - API-only service)
│   ├── pages/            # (No pages - API-only service)
│   ├── hooks/            # (No hooks - API-only service)
│   ├── lib/              # Utility functions, helpers
│   ├── services/         # External API integrations
│   │   ├── aws_connectors.ts    # Bedrock, vLLM, Mantle connectors
│   │   ├── model_registry.ts    # Model routing registry
│   │   └── policy.ts            # Policy engine
│   ├── store/            # State management
│   │   ├── db.ts                # Database layer
│   │   ├── loop_detector.ts     # Loop detection engine
│   │   └── context_cache.ts     # Context caching engine
│   ├── types/            # TypeScript types and interfaces
│   ├── styles/           # (No styles - API-only service)
│   ├── server.ts         # Main Fastify server
│   ├── dashboard.ts      # Admin dashboard rendering
│   ├── ciso_report.ts    # CISO report generation
│   ├── test-client.ts    # Test client utilities
│   └── test-manual-mode.ts # Manual mode testing
├── dist/                 # Compiled output (generated)
├── ccr_database.json     # Local database (auto-created)
├── ccr_telemetry.json    # Telemetry data (auto-created)
├── package.json
├── tsconfig.json
└── .env.example          # Environment template
```

---

## Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Components | N/A | N/A |
| Hooks | N/A | N/A |
| Utilities | camelCase | `computeActualCost`, `extractToolCalls`, `hashString` |
| Services | camelCase | `aws_connectors`, `policy`, `model_registry` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_WINDOW_SIZE`, `TERMINAL_LOOP_THRESHOLD` |
| Test files | `[filename].test.ts` | `server.test.ts` |
| Types/Interfaces | PascalCase, no `I` prefix | `ToolCallRecord`, `NormalizedToolCall` |
| API routes | `kebab-case`, plural nouns | `/admin/api/route`, `/admin/api/policies` |
| Environment variables | SCREAMING_SNAKE_CASE | `UPSTREAM_URL`, `PORT`, `REPO_PATH` |

---

## Code Style Standards

### TypeScript / JavaScript
- Prefer `const` over `let`; never `var`
- Arrow functions for callbacks; named functions for top-level declarations
- **No `any` in TypeScript** — use `unknown` and narrow, or define proper types
- **No `console.log`** in production code — use logger instead
- **No hardcoded secrets** — use environment variables

### API Design
- `GET` reads, `POST` creates, `PUT`/`PATCH` updates, `DELETE` deletes
- Consistent response shape: `{ success, data?, error? }`
- HTTP status codes semantically correct — no 200 on an error
- All API routes under `/admin/api/` for admin endpoints

### Error Handling
- All `async` functions have `try/catch` or explicit error propagation
- Error responses include `type` and `message` fields
- Log errors with correlation IDs for tracing

### Security
- No secrets, API keys, or tokens in source — `.env` only
- User input validated at API boundary
- No `eval()`, no `new Function()`
- Admin endpoints require `ADMIN_TOKEN` header

---

## Code Quality — Non-Negotiable

- No `console.log` in committed code
- No hardcoded values — use config or env vars
- No unused variables, imports, or dead code
- No commented-out code — git history preserves it
- Every `fetch()`/HTTP request checks response status before parsing
- Every `async` function has `try/catch` or explicit error propagation
- Loading, error, and empty states handled for every data fetch

### Security (Enforced)
- No hardcoded secrets, API keys, or tokens in source
- User input validated server-side on all endpoints
- No `innerHTML` with untrusted data
- No `eval()`, no `new Function()`
- Auth checked server-side on protected routes
- Sensitive endpoints rate-limited

---

## Testing

- Unit tests: utility functions, hooks, services
- Integration tests: API endpoints, database operations
- Framework: **Vitest** + **Testing Library**
- Coverage target: **80%**
- Mock external services — never hit real endpoints in tests
- CI runs tests on every PR

---

## Git and PR Conventions

- Branch naming: `feature/short-description`, `fix/bug-description`
- Commit messages: `feat: add user auth flow` (Conventional Commits)
- PRs: small and focused — one concern per PR
- No force-pushing to `main`

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `UPSTREAM_URL` | No | Upstream API URL (default: `https://api.anthropic.com`) |
| `PORT` | No | Gateway port (default: `8081`) |
| `REPO_PATH` | No | Workspace repository path (default: cwd) |
| `ADMIN_TOKEN` | No | Admin endpoint authentication token |
| `MOCK_LOCAL` | No | Enable mock mode for local routes |
| `CCR_DISABLE_WORKSPACE_POLICY` | No | Disable workspace-based policy enforcement |

---

## AI Agent Behavior Rules

1. **Read the folder structure before creating files** — don't duplicate what exists
2. **Ask before adding dependencies** — state purpose, bundle cost, native alternative
3. **Never auto-commit** — summarize what changed and why first
4. **Flag scope creep** — if a request touches more than one area, say so
5. **Don't paper over problems** — surface architectural issues out loud
6. **Self-review after every non-trivial change** against the checklist above
7. **TypeScript strict mode** — no `any` types without narrowing
8. **Test first** — use TDD for new features (RED-GREEN-REFACTOR)

---

## Development Workflow

1. **Setup**: `npm install`
2. **Run dev**: `npm run dev` (tsx watch mode)
3. **Build**: `npm run build` (TypeScript compilation)
4. **Start**: `npm start` (production mode)

### Adding a New Model Route

1. Update `src/model_registry.ts` with new model entry
2. Add cost entries in `src/server.ts` `TOKEN_COSTS` object
3. Update `getRouteConfig()` in `src/db.ts` if needed
4. Test via `/admin/api/registry` endpoint

### Adding a New Policy Rule

1. Update `DEFAULT_RULES` in `src/policy.ts`
2. Define `PolicyMode` (`monitor`, `warn`, `enforce`, `route`)
3. Define `PolicyType` (`file_path`, `regex_pattern`, `ccrignore`)

---

## Debugging

- Check `ccr_database.json` for request logs
- Check `ccr_telemetry.json` for usage telemetry
- Use `logger.info()` with correlation IDs for tracing
- Admin dashboard at `/admin/dashboard` shows live stats

---

## Deployment

This is a development gateway — no production deployment configuration yet.

---

## Links

- [Fastify Documentation](https://www.fastify.io/docs/latest/)
- [AWS SDK for JavaScript](https://docs.aws.amazon.com/sdk-for-javascript/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
