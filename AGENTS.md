# Agent navigation

This repository contains a committed Graphify code graph. Use it before broad text search when the question is structural, for example “what calls X?”, “how does the platform override reach tenant APIs?”, or “which files form the provisioning pipeline?”

## Start here

- `graphify-out/wiki/index.md` — community index and plain-language map.
- `graphify-out/GRAPH_REPORT.md` — graph summary, god nodes, surprising connections, suggested questions.
- `graphify-out/erp-callflow.html` — request/call-flow diagrams.
- `graphify-out/graph.html` — interactive graph visualization.
- `graphify-out/graph.json` — raw graph data.

## Query commands

Graphify CLI was installed with:

```powershell
python -m pip install --user --upgrade "git+https://github.com/Graphify-Labs/graphify.git"
```

On this Windows host the executable is:

```text
C:\Users\user1\AppData\Roaming\Python\Python312\Scripts\graphify.exe
```

Examples:

```powershell
graphify query "How does the tenant workspace dashboard load data?"
graphify path "WorkspaceDashboardPage()" "server/src/routes/workspace.ts"
graphify explain "provisioning service"
graphify query "What is connected to platform module access?" --budget 2000
```

If the CLI is unavailable, load `graphify-out/graph.json` with NetworkX or another JSON graph reader. Prefer the committed graph over rebuilding unless source files changed substantially; if rebuilding, install SQL grammar support with `python -m pip install tree_sitter_sql`.

## Source-of-truth files

- `README.md` — architecture and local setup.
- `design.md` — visual design contract.
- `BUILD_PROMPT_MULTITENANT.md` — scope and acceptance tests.
- `PHASES.md` and `docs/BUILD_PLAN.md` — phase history.
- `docs/PHASE13_VERIFICATION.md` — final verification evidence.
- `docs/SECURITY.md` — security model and sign-off.
