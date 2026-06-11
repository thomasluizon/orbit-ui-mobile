# Orbit design handoff — vendored canon

Vendored from `Orbit-handoff.zip` (Claude Design navy+violet handoff, June 2026). This bundle is the design source of truth for the #163 full redesign and everything after it. `DESIGN.md` at the repo root is the distilled spec; when in doubt, the files below win.

**Rule: only what `Orbit App - Figma.html` imports is canon.** The zip also contains an older iteration that was never part of the final handoff — ignore it (kept only so the vendored bundle is byte-complete).

## Canon

| File | Role |
|---|---|
| `orbit/project/Orbit App - Figma.html` | Entry point — 65 artboards in 10 sections. Open in a browser to view. |
| `orbit/project/orbit-fig.css` | **Token source of truth** — palette, dark + light modes, 6×2 scheme accents, type scale + roles, radii, shadows, motion |
| `orbit/project/orbit-kit.jsx` | Component kit (~20 primitives with exact dimensions) |
| `orbit/project/orbit-fig-core.jsx` | Início, Astra chat, Agenda, Hábito, Criar, Conquistas, Login/OTP, Onboarding, Tudo certo |
| `orbit/project/orbit-fig-more.jsx` | Remaining screen designs |
| `orbit/project/orbit-fig-subs.jsx` | Subscription screen designs |
| `orbit/project/orbit-screens-account.jsx` | Account screen designs |
| `orbit/project/design-canvas.jsx` | Canvas harness (needed to open the HTML; not a design source) |
| `orbit/project/assets/` | Brand assets (`logo.png`, `saturn.png`) |
| `orbit/project/screenshots/` | Reference renders |

## Ignore entirely (older iteration, NOT imported by the canon HTML)

`Orbit App.html`, `Orbit App-print.html`, `colors_and_type.css`, `orbit-components.jsx`, `orbit-app-components.jsx`, all `orbit-screens-{today,chat,cal-profile,detail-create,subs,flows,overlays,extras,subhabits}.jsx`, `fig/fig-tokens.css`, `fig/fig-typography.css`.

## Reference-only artboards (features that don't exist — do NOT build)

`astra-voice`, `sub-downsell`, `sub-pricing`, `sub-billing` (invoice history), Apple sign-in on the login artboard, Apple-Health/Wear rows on `integr`.
