<!-- Context: project-intelligence/decisions | Priority: high | Version: 1.0 | Updated: 2026-04-24 -->

# Orbit Decisions Log

> This file records decisions that agents must preserve unless Thomas explicitly asks to change them.

## Decision: Cross-Platform Parity Is Mandatory

**Status**: Decided  
**Owner**: Thomas

### Decision

Every change must be applied to both `apps/web` and `apps/mobile` when the behavior is user-visible or business logic related.

### Rationale

Orbit is a cross-platform habit tracker. Users should not get different capabilities, validation, query behavior, error handling, or copy based on device.

### Impact

- More work per feature.
- Less platform drift.
- Shared package changes are preferred for common logic.

## Decision: Web Uses BFF, Mobile Uses Direct API

**Status**: Decided  
**Owner**: Thomas

### Decision

Web uses Next.js Route Handlers and Server Actions as a BFF. Mobile calls the .NET API directly.

### Rationale

Web needs httpOnly cookie auth and path allowlisting. Mobile uses SecureStore and native API calls.

## Decision: Backend Owns Schedule Calculations

**Status**: Decided  
**Owner**: Thomas

### Decision

Frontend does not compute due dates or schedule logic. It sends date ranges and renders backend results.

### Rationale

Centralized schedule logic prevents platform-specific date bugs.

## Decision: Shared Contracts Live In `@orbit/shared`

**Status**: Decided  
**Owner**: Thomas

### Decision

Types, schemas, endpoints, i18n, theme data, query keys, and shared validation belong in `packages/shared`.

### Rationale

Both apps import the same contracts, reducing drift and duplicate logic.

## Related Files

- `AGENTS.md`
- `technical-domain.md`
- `business-tech-bridge.md`
