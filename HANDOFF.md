# CPQ App — Handoff (2026-07-10)

Continuation notes for picking this up on another machine. The app is a browser-only
static web app (React + TS + Vite + Zustand, no backend) that quotes stainless-steel
vessel gas-conditioning systems (H2S removal, siloxane, etc.).

## Run it
```
cd cpq-app
npm install
npm run dev      # http://localhost:5173
npm run build    # static dist/
npx tsc --noEmit # typecheck
```

## What was just built (this session)
Focus: make the **H2S system BOM template** carry real materials and scale across
vessel sizes without a per-size template explosion.

1. **Every H2S material step now imports with example parts** (was empty placeholders).
   Example part numbers like `PIPE-04-10S-304`, `VLV-BFY-04-150-SS` show the format;
   replace with real ERP parts. See `shared/h2sSystem.ts` → `DEFAULT_H2S_SYSTEM_CONFIG`.

2. **Export/import round-trips the parts.** The "Export H2S Rules" workbook's
   **Material Steps** sheet gained Component / Size Key / Part # / Qty columns. A step's
   parts span multiple rows (Step#/Name/Kind/Arrangements on the first row, blank on
   continuation rows). `src/lib/excelH2s.ts`.

3. **Multi-size scaling model** — template scales by *dimensions of variation*, not by
   vessel size. Three part categories:
   - **Size-invariant** — plain row, no Size Key (gauges, signage).
   - **Quantity-driven** — `Qty` is a `=formula` of vars `D` (vessel dia ft), `SS`
     (straight side ft), `N` (vessel count), `PI`. E.g. grating `=PI*D*3`.
   - **Spec-driven** — one row per line size via `Size Key`, e.g. `line=4"` → 4" valve.
     Only the matching variant emits.
   Size Key keys: `line`, `grade`, `arrangement` (join with `;`, all must match).
   `line` = the app's flow-based pipe size label (`4"`,`6"`…), NOT vessel diameter.
   Helpers in `shared/h2sSystem.ts`: `resolveQty` (safe arithmetic, no JS eval),
   `partMatches`.

## Key files
- `shared/h2sSystem.ts` — H2S system BOM generator + `DEFAULT_H2S_SYSTEM_CONFIG` (the template).
- `shared/h2sVesselSizing.ts` — Ferrosorp vessel sizing (ports Vessel Sizing.xlsx).
- `shared/pipeSizing.ts` + `gasProperties.ts` — flow → pipe size.
- `shared/assembler.ts` — generic parametric rule engine (fixed/variant/placeholder).
- `src/lib/excelH2s.ts` — H2S rules workbook read/write.
- `src/components/AssemblerModal.tsx` — the "⚙ BOM Assembler" UI. Note: the H2S system
  uses the **"Generate H2S System →"** button (middle panel), NOT the bottom
  "Generate Draft BOM →" (that's the separate generic pipe assembler and needs its own
  rules workbook imported).

## Still open (from Curt)
- Real labor hours/rates (current numbers in `DEFAULT_H2S_SYSTEM_CONFIG` are placeholders).
- Real ERP part numbers + qtys/formulas to replace the example parts.
- Vessel material pricing by size/grade (currently manual / requiresInput). Vessel PNs
  belong in the price list as `H2S-VESSEL-<D>x<SS>-<grade>`.
- A template editor so rules are adjustable without code (config lives in `shared/h2sSystem.ts`).
- Other system types to come (siloxane, etc.).

## Continuing with Claude Code on the work machine
Copy the memory files from this machine's
`~/.claude/projects/<project>/memory/` (MEMORY.md, cpq-app-project.md,
h2s-system-bom-structure.md) into the same location on the work machine so Claude has
the project context. They're the durable summary of everything above.
