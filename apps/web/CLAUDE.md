# apps/web: Next.js 16 and App Router

Web client. Server Components by default. Auth uses httpOnly cookies and a BFF proxy.

## Rules

- All mutations go through Server Actions in `app/actions/*.ts`. A client component never calls the API. There are two exceptions. The cookie-setting auth routes in `app/api/auth/*` are BFF route handlers, because they own the httpOnly cookie. The SSE chat send in `hooks/use-chat-composer.ts` calls the BFF chat-stream route, because a Server Action cannot return a stream.
- Server Actions read with `serverAuthFetch` and write with `serverAuthMutate`. Both forward the cookie. A Server Action strips a thrown error to `digest`, so wrap the body in `wrapServerAction` (`app/actions/action-result.ts`), which returns a serializable `ServerActionResult`.
- Cache refresh is client-side. Mutation hooks call `queryClient.invalidateQueries` with keys from `@orbit/shared/query`. Server Actions never call `revalidateTag` or `revalidatePath`.
- Persist a Zustand store with `skipHydration: true` and rehydrate it in `lib/providers.tsx`, to avoid an SSR mismatch.
- Form schemas live in `packages/shared/src/validation/*.ts`, so mobile uses the same rules.
- `app/api/[...path]/route.ts` forwards client requests to `orbit-api` with the cookie's bearer token. The mobile app calls `orbit-api` directly.
- A React inline style that sets a shorthand and then a longhand to `undefined` loses half the shorthand on the client only. Set both longhands.
- Wrap shadcn-style primitives in `components/ui/*` and restyle them to the tokens. Never use one in its default state.
