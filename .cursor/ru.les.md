# Cursor Rules — Next.js + React

## Stack
- Framework: Next.js (App Router unless stated otherwise)
- UI: React (functional components only)
- Language: TypeScript
- Styling: Tailwind CSS / CSS Modules

## Code Rules
- Prefer small, scoped changes
- DO NOT rewrite entire files unless explicitly asked
- Preserve existing patterns and folder structure
- Reuse existing hooks, utils, and components

## React Guidelines
- Avoid unnecessary re-renders
- Use `useMemo` / `useCallback` only when justified
- Prefer controlled components
- Keep effects minimal and well-scoped

## Next.js Guidelines
- Prefer Server Components by default
- Use `"use client"` only when required
- Do not move logic between server/client without asking
- Avoid breaking routing or layout structure

## Styling
- No inline styles unless already used
- Match existing Tailwind conventions
- Do not introduce new design systems

## Output Rules
- Return **minimal diff only**
- No full file rewrites
- No explanations unless requested
