# Repository Guidelines

## Project Structure & Module Organization
Streamerpulse is a Next.js App Router project. Core routes and UI live in `src/app`; nest feature folders (e.g. `src/app/dashboard`, `src/app/dashboard/components`) to co-locate routing, components, and server actions. Global styles and Tailwind layers stay in `src/app/globals.css`. Place static assets in `public/`, and keep shared config in `next.config.ts` and `postcss.config.mjs`. Shared helpers belong in `src/lib/` when they span routes.

## Build, Test, and Development Commands
- `npm run dev` – Starts the dev server on http://localhost:3000 with Turbopack hot reloads.
- `npm run build` – Produces an optimized production bundle; run before deploys.
- `npm run start` – Serves the prebuilt bundle; use to verify production behavior.
- `npx next lint` – Runs the built-in lint rules; execute before opening a PR.

## Coding Style & Naming Conventions
Write TypeScript-first React 19 components using App Router patterns. Use two-space indentation, PascalCase for component files (`StreamingCard.tsx`), and kebab-case for route segment folders (`src/app/live-events`). Prefer functional components with explicit prop typing. Group Tailwind classes by layout → spacing → typography, and extract long sets into helpers or constants. Run your editor’s Prettier integration so diffs stay minimal.

## Testing Guidelines
Automated tests are not yet scaffolded; when adding them, configure `next/jest` and add an `npm run test` script that calls `next test`. Place component tests under `src/__tests__/` or alongside source files as `*.test.tsx`, using React Testing Library for DOM interactions. Name tests after the user scenario they cover (`HomePage renders hero copy`) and include accessibility checks when practical. Target high-traffic routes such as `src/app/page.tsx` and any future server actions.

## Commit & Pull Request Guidelines
History currently follows short, imperative commit messages (`Add dashboard route`). Keep commits scoped to a single behavior change and include context in the body when needed. Each pull request should link the relevant issue, describe the change, list local verification (`npm run build`, `npx next lint`, and tests once available), and attach screenshots or clips for UI updates. Request review only after rebasing onto the latest main.

## Environment & Configuration
Secrets belong in `.env.local`, which remains untracked; document required keys in `.env.example` when introducing them. Use `process.env.NEXT_PUBLIC_*` only for values safe to expose to the browser. Update `next.config.ts` when adding rewrites, API proxies, or external image domains, and call out those changes in PR descriptions so reviewers can confirm deployment implications.
