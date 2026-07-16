---
title: Zenbook S14 (Lunar Lake 258V) optimization for 6-7 concurrent Claude Code sessions
date: 2026-07-16
status: research complete, awaiting user decisions on uninstall + apply
method: deep-research (orchestrator + 3 parallel research agents, each with sub-agents), grounded in first-party machine measurement
---

# At a glance

**Machine:** ASUS Zenbook S14 UX5406SA · Intel Core Ultra 7 258V (Lunar Lake, 8C/8T, NO HyperThreading: 4 P Lion Cove + 4 LP-E Skymont) · 32 GB soldered LPDDR5X-8533 (non-upgradable) · 952 GB NVMe (571 GB free) · Win 11 Home 26200 (25H2) · BIOS UX5406SA.309 (current) · Arc 32.0.101.8860 (current).

**Symptom:** system-wide interactive lag (typing latency, Opera tabs failing to load) while running 6-7 concurrent Claude Code CLI sessions + Opera + VS Code + WSL2/Docker + Obsidian + Slack, on AC.

**Root causes, in order of measured impact:**
1. **Memory pressure** — commit charge 42 GB against 31.5 GB physical (86-87%), ~11 GB paged, 73-95 pages/sec sustained. This is the dominant cause of the interactive lag. RAM is soldered, so the fix is reducing demand, not adding RAM.
2. **Default power cap** — MyASUS "Standard" mode walls the chip at 17 W PL1. "Performance" mode on AC = 24 W = +48% sustained multi-core (406 -> 602 CB2024). Biggest free throughput win.
3. **Lunar Lake E-core-first scheduling** — by design, bursty many-process work (the Claude/MCP fan-out) piles onto the 4 weak LP-E cores while P-cores stay parked. Inherent to the chip; mitigated by cutting process count.
4. **MCP process fan-out** — each Claude session spawns its own stdio MCP servers; user-scoped servers spawn in ALL sessions. Plus a known Claude Code bug orphans MCP processes on exit.
5. **Defender file-scanning** — real-time scanning of node_modules on NTFS with no Dev Drive and 67 live node.exe.

**The counter-intuitive finding:** do NOT disable VBS/HVCI. On this MBEC-capable chip HVCI runs hardware-accelerated (cheap), and the hypervisor stays loaded for WSL2 regardless, so disabling it buys ~0 while costing real kernel security. The popular "disable VBS for FPS" advice measures removing the hypervisor entirely (impossible here) or is a gaming benchmark.

---

## First-party machine measurements (2026-07-16, verified in-session)

- RAM: 31.48 GB total, ~6 GB free. Commit 42.4/49.4 GB (86-87%). Pagefile 14.55 GB alloc, system-managed (`AutomaticManagedPagefile=True`) — leave as is.
- CPU: 73-79% sustained across all 8 threads; `% Processor Performance` 115-119% (boosting, not thermally capped at sample).
- Processes: 574 total. node x69 (5.97 GB), claude x7 (3.19 GB), opera x27 (3.2 GB), vmmemWSL (2.4 GB), chrome-headless-shell x8 (1.9 GB, ORPHANED), Code x15 (1.64 GB), cwm-roslyn-navigator x4 (1.42 GB), 60 cmd + 46 conhost (MCP wrapper chains).
- Power: Balanced scheme, no overlay active. `PROCTHROTTLEMIN` class-0 = 100% (non-default) but class-1 = 5% (Control-Panel one-class bug — only half-applied). Default for Balanced = 5%.
- Security: `VirtualizationBasedSecurityStatus=2` (on+running). `SecurityServicesRunning=2,3,4` = HVCI + System Guard Secure Launch + SMM Firmware Measurement. `AvailableSecurityProperties=1,2,3,5,6,7,8` — **7 = MBEC present**. HVCI `Enabled=1, Locked=(none), WasEnabledBy=0` — disableable via registry, NOT UEFI-locked.
- Riot Vanguard `vgk`: Running, Start=System (boot). `vgc` stopped/manual. Not gaming.
- WSL2: docker-desktop distro, `.wslconfig` = `memory=4GB`, vmmemWSL ~2.4 GB. Hypervisor `HypervisorPresent=True`, `hypervisorlaunchtype=Auto`.
- Dev Drive: feature enabled, but NO ReFS volume created yet.

---

## Q1 — Is 6-7 concurrent Claude sessions viable on 8 threads/32 GB? What's the ceiling?

**Honest answer: 6-7 is oversubscribed. The binding constraint is RAM commit, then threads.** 8 logical cores with no HyperThreading and 32 GB soldered cannot comfortably host 6-7 agentic sessions each spawning process trees. At 86-87% commit the machine pages constantly — that IS the lag. A realistic comfortable ceiling for THIS machine is **~3-4 active sessions**, more if idle/parked. Governed by: (1) commit charge first, (2) the 8-thread scheduler under bursty many-process load second, (3) MCP fan-out amplifying both.

## Q2 — MCP server sharing/scoping (verified against live Claude Code docs, CLI v2.1.197)

- **No cross-session pooling exists or is planned** (feature request #28860 closed as duplicate). Each session spawns its own instance of every configured+approved stdio server. Confirmed by walking the live process tree: mcpvault / obsidian / chrome-devtools each appeared exactly 7x, one per session PID.
- **Subagents do NOT multiply MCP processes** — they inherit the parent's connections unless given `mcpServers` frontmatter. The multiplier is top-level SESSIONS.
- **The 7x9=63 arithmetic is refuted but the multiplicative model holds:** 5 of the 9 project servers (vercel, render, stripe, sentry, stitch) are already `type:"http"` = ZERO local processes. Only ~4 are local per session.
- **Biggest overlooked cost = user-scoped servers** (obsidian, chrome-devtools, a vault-memory server) that spawn in ALL 7 sessions regardless of project. They load from `~/.claude.json`, NOT this repo's `.mcp.json`.
- **Levers (all verified live):**
  - `.mcp.json` scope demotion: user -> local/project stops a server spawning in unrelated sessions.
  - `claude --strict-mcp-config --mcp-config <file>` — strongest per-session reducer: session ignores all other config, spawns only what you pass. `--mcp-config` accepts multiple files or inline JSON strings.
  - `/mcp` slash command — live per-session toggle; disconnecting frees that process.
  - settings.json `disabledMcpjsonServers: [...]` — rejects named project servers so they never spawn (the other two keys, `enabledMcpjsonServers`/`enableAllProjectMcpServers`, only pre-approve; they don't reduce load). These apply ONLY to project `.mcp.json` servers, not user-scoped.
  - `ENABLE_CLAUDEAI_MCP_SERVERS=false` / `disableClaudeAiConnectors` — kills auto-injected claude.ai connectors (drove OOM report #20412).
- **No lazy/on-demand loading for local CLI** — every request for it rejected (#18497, #38365, #23411 all NOT_PLANNED). MCP tool-search (`ENABLE_TOOL_SEARCH`) defers tool SCHEMAS from context, not the process — server still spawns at startup.
- **HTTP transport eliminates local processes:** migrating a stdio server to a hosted HTTP endpoint = 0 local processes, 1 remote instance serves all sessions. Hosted endpoints exist for: Sentry `https://mcp.sentry.dev/mcp`, Stripe `https://mcp.stripe.com/`, Vercel `https://mcp.vercel.com`, Render `https://mcp.render.com/mcp`, **SonarQube Cloud `https://api.sonarcloud.io/mcp`** (migration opportunity — drop local docker), Stitch `https://stitch.googleapis.com/mcp`. The two postgres servers use an ARCHIVED/deprecated package (`@modelcontextprotocol/server-postgres`) — replace with a maintained server, don't just re-wrap.
- **Windows cmd+conhost wrappers** = the `cmd /c npx` pattern (Node 24 refuses to spawn .cmd directly). Each npx stdio server = ~2 cmd + 1 conhost + 3 node PER session. Fix: invoke `node` directly on the server's dist entrypoint (npm i -g the server, point at the global path — not the GC'd _npx cache), or use HTTP, or native .exe (csharp-lsp already takes no wrapper).
- **Known bug:** MCP/child processes orphan on exit and accumulate (#1935 OPEN, #67888/#73785 Windows-specific — #73785 literally describes ~10 concurrent sessions pinning WmiPrvSE at 300-550%). Periodically exiting ALL sessions and sweeping stray node/cmd is currently the only reliable reclamation.

## Q3 — Min processor state 100%: HURT (revert to 5%)

Net-negative on Lunar Lake, though not the primary lag cause. Pins the active-frequency floor high, spending the scarce 17 W PL1 budget on background work and raising the thermal baseline, for zero throughput gain. It does NOT prevent C-states or defeat core parking (those are folklore — separate knobs). Default for Balanced = 5% (verified from the machine's own `DefaultPowerSchemeValues`). Currently only half-applied (class-0=100, class-1=5) due to the documented Control-Panel one-class bug. Fix: `powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 5` + `-setdcvalueindex ... 5` + `-setactive SCHEME_CURRENT`, or Control Panel -> restore plan defaults.

## Q4 — VBS/HVCI cost + does it stack with WSL2? (the crux — DON'T disable)

- `258V has MBEC` (Intel ARK: "Mode-based Execute Control: Yes"; confirmed on machine, AvailableSecurityProperties=7). So HVCI runs the hardware fast path, not the pre-MBEC Restricted-User-Mode emulation the horror stories describe.
- Measured HVCI cost is a gaming corpus: ~2-6% on MBEC hardware (Tom's Hardware 2023 ~5%, ComputerBase ~4-6%, Digital Trends <3%). The viral "28-30%" is a single unreproduced 2021 i7-10700K sample. NO credible dev-workload/build benchmark shows HVCI slowing builds. Puget does NOT publish per-app VBS deltas (common fabrication).
- **The cost does NOT stack removably with WSL2.** Three layers: (1) hypervisor present + host as virtualized root partition (the genuinely expensive "your machine is virtualized" / ~6x TLB-miss-walk cost) — **required by WSL2, cannot remove**; (2) base VBS/VTL1; (3) HVCI image validation. Disabling VBS/HVCI reclaims only 2+3; layer 1 stays for WSL2. The internet's big numbers assume layer 1 disappears — impossible here. Puget measured hypervisor-present native-app impact at -2.5% to +0.5% ("negligible").
- **HVCI not UEFI-locked** on this machine (no `Locked` value; `WasEnabledBy=0`) — disableable via registry if ever wanted, but not worth it.
- **Verdict: leave VBS + HVCI ON.** The real Defender lever (below) keeps security intact and is where the measurable win is.

## Q5 — Windows 11 25H2 power/perf settings that matter

- **MyASUS fan/perf mode is THE lever** (owns PL1). Standard=17 W, Performance=24 W, Full Speed=28 W. Set **Performance on AC** (Fn+F5 or MyASUS app). +48% sustained MT measured (Notebookcheck UX5406SA).
- Windows power mode -> **Best Performance** on AC: free, small (EPP 30->25 + faster ramp), helps responsiveness, ~0 on sustained throughput. NOTE: `powercfg /getactiveoverlayscheme` and `/setactiveoverlayscheme` return "Invalid Parameters" on build 26200 — use the Settings slider, not the CLI.
- Overlay GUIDs (from machine `powercfg /aliasesh`): BestEfficiency `961cc777-...`, Balanced `00000000-...`, BestPerformance `ded574b5-45a0-4f42-8737-46345c09c238`.
- Cooling posture matters (measured): chassis "marginally fails" stress flat on desk; elevating buys sustained watts before the 95-96 C wall.
- DTT/IPF healthy on machine (dptftcs Running, 0 problem devices). "Intel Endurance Gaming" startup entry = games-only throttler, red herring, safe to disable.
- BIOS 309 + Arc 8860 already current. No action.

## Q6 — Defender exclusions / Dev Drive (the real measurable win, keeps security)

- Isolated datapoint: `npm init` ~60s -> ~200s with Defender -> ~80s with path exclusions (~60% cut).
- Commands (admin): `Add-MpPreference -ExclusionPath 'C:\Users\thoma\Documents\Programming\Projects'` + `Add-MpPreference -ExclusionProcess 'node.exe'`. Measure first with `New-MpPerformanceRecording` / `Get-MpPerformanceReport`.
- Better: create a **Dev Drive** (ReFS, Settings -> System -> Storage -> Advanced -> Disks & volumes -> Create Dev Drive), move repos + node_modules + package caches there. Async Defender "performance mode" on by default; MS measured ReFS builds ~14% faster (28% with CoW). Microsoft's blessed path INSTEAD OF weakening the security stack.

## Q7 — Pagefile

Already `AutomaticManagedPagefile=True`. Leave system-managed. A fixed pagefile won't fix commit exceeding physical RAM by 11 GB — the fix is reducing demand (fewer sessions), not resizing the pagefile. Don't cap it (risks commit-fail crashes under this pressure).

## Q8 — Opera under memory pressure

Tabs failing to load = memory pressure symptom, not an Opera bug per se. But 27 opera processes / 3.2 GB is heavy. Options: enable tab hibernation/snooze (opera://settings, "Save inactive tabs"), keep hardware acceleration ON (offloads compositing to Arc iGPU, reduces CPU contention), or cut tab count. Opera is not meaningfully worse than Chrome/Edge here; all Chromium browsers behave the same under commit pressure. The real fix is upstream (free RAM).

## Q9 — Third-party tuning tools: mostly snake oil on Lunar Lake

- ThrottleStop 9.7: runs but undervolt is architecturally GONE on Lunar Lake (on-die DLVR; MSR-0x150 path not exposed). Monitor-only at best.
- Intel XTU: does NOT support the 258V (unlocked K/X + Z-chipset only). Knobs inert. Avoid.
- Process Lasso: no Lunar-Lake-aware logic; the manual affinity/CPU-Sets rules people install it for FIGHT Thread Director on an 8-thread hybrid chip. Measured negligible-to-negative. Avoid. The viral "+40% FPS" is an AMD X3D dual-CCD feature, irrelevant.

---

## Sources (all fetched live 2026-07-16; see agent transcripts for full URL list)
- Claude Code docs: code.claude.com/docs/en/{mcp,settings,cli-reference,troubleshooting}; anthropics/claude-code issues #28860/#1935/#67888/#73785/#18497/#38365/#20412; MCP spec 2025-11-25.
- Intel ARK Core Ultra 7 258V (SKU 240957); Intel SDM Vol 3B rev 084 §15; Intel Tech Tour Lunar Lake deck 2024; Chips and Cheese Skymont 2024-10-03.
- Notebookcheck UX5406SA review 2024-09-24 (per-mode PL1/PL2 + CB2024); LaptopMedia; UltrabookReview; Phoronix ASUS AIPT 2024-10-20.
- Microsoft Learn: enable-virtualization-based-protection-of-code-integrity (2025-08-15); power-performance-tuning (2025-04-28); MinPerformance/PerfEnergyPreference/CPMinCores docs; Hyper-V VSM/TLFS (2025-12-16); WSL FAQ (2026-06-29); Dev Drive docs.
- HVCI benchmarks: Tom's Hardware (Klotz) 2023; ComputerBase 2023/2024; Digital Trends 2022; Connor McGarr hvci writeups 2022/2024; Puget Systems 2020/2022.
- Riot: Vanguard On-Demand 2026-06-24; uninstall/disable KB; /dev retrospective 2024-08-22.
