# SHELL-FIX → PROFILE-FIX

## design 11 (ck7, LOW) — profile loading skeleton radii off-scale
File: `apps/web/app/(app)/profile/page.tsx:214,218`
Two loading skeletons use `rounded-sm` (4px) — a shadcn-default remnant off the 8/12/16/20/999 radius scale. (Line 210-211's `rounded-full` badge bone is fine.)
Fix: `rounded-sm` → `rounded-lg` (8px) on both, matching `ui/skeleton.tsx` (radius 16) / the achievements skeleton fix SHELL applied at `achievements/page.tsx:97-99` (`rounded-md` → `rounded-lg`).
Web-only (mobile profile skeletons, if any, resolve through StyleSheet radii — verify on-scale while you're in the file).
No i18n.
