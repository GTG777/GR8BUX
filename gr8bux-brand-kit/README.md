# GR8BUX Brand Kit — Drop-in for the VS Code Portal

This kit unifies the portal's look with the new public site at **gr8bux.com**.
Everything here is framework-agnostic React + Tailwind v4 + shadcn-style tokens.

## What's in this folder

| File | Purpose | Where to put it in the portal |
|---|---|---|
| `styles.css` | All design tokens (colors, fonts, gradients, animations) — light + dark | Replace your existing global stylesheet (e.g. `src/index.css` / `src/app.css`) |
| `Logo.tsx` | The official animated SVG brand emblem + wordmark | `src/components/Logo.tsx` (or `src/components/brand/Logo.tsx`) |
| `gr8bux-favicon.svg` | Matching SVG favicon | `public/favicon.svg` |
| `index.html.snippet.html` | `<head>` tags: fonts, favicon, theme color | Paste into the portal's `index.html` `<head>` |
| `tailwind-notes.md` | Tailwind v4 vs v3 setup notes | Reference only |
| `usage-examples.tsx` | Copy-paste examples: gradient buttons, brand text, glass header, CTA card | Reference only |

---

## Step-by-step integration (≈ 30 minutes)

### 1. Tailwind setup

The portal must be on **Tailwind CSS v4** for `styles.css` to work as-is. Two options:

- **Recommended** — Upgrade to Tailwind v4 (`npm i tailwindcss@latest @tailwindcss/vite@latest`) and use the Vite plugin. Tokens then live entirely in `styles.css` (no `tailwind.config.js` colors needed).
- **Stay on v3** — See `tailwind-notes.md` for how to mirror these tokens into a `tailwind.config.js`.

### 2. Drop in the design tokens

Replace your global stylesheet with `styles.css`. It defines:

- Light + dark color palette in `oklch` (semantic: `--background`, `--foreground`, `--primary`, `--card`, `--muted`, etc.)
- Brand colors: `--brand-green`, `--brand-blue`, `--brand-navy`, `--bull`, `--bear`
- Surface + chart palette
- Typography: **Space Grotesk** (display/headings), **Inter** (body), **JetBrains Mono** (code/numbers)
- Utilities: `.bg-gradient-brand`, `.text-gradient-brand`, `.bg-grid`, `.bg-radial-fade`, `.glass`, `.ring-glow`
- Animations: `.animate-ticker`, `.animate-float-slow`

### 3. Load the fonts

Paste `index.html.snippet.html` into your portal's `<head>`. It preconnects to Google Fonts and pulls Inter + Space Grotesk + JetBrains Mono. Add the favicon link too.

### 4. Drop in the Logo

Copy `Logo.tsx` to `src/components/Logo.tsx`. It depends on:

```ts
// src/lib/utils.ts (standard shadcn helper — you likely already have it)
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

Install if missing: `npm i clsx tailwind-merge`

Use anywhere:
```tsx
import { Logo } from "@/components/Logo";

<Logo size={36} />              // header
<Logo size={28} iconOnly />     // tight spaces
<Logo size={200} iconOnly className="drop-shadow-2xl" />  // hero
```

### 5. Dark mode toggle (optional but recommended)

Add a `class="dark"` toggle on `<html>` to flip themes. The standard pattern:

```tsx
// Anywhere on app boot
const stored = localStorage.getItem("theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
if (stored === "dark" || (!stored && prefersDark)) {
  document.documentElement.classList.add("dark");
}
```

---

## Brand rules (keep both sites consistent)

- **Primary CTA**: gradient — `className="bg-gradient-brand text-white hover:opacity-90"`
- **Brand text accent**: `<span className="text-gradient-brand">word</span>`
- **Headings**: always `font-display` (Space Grotesk), tight letter-spacing
- **Numbers / prices / tables**: `font-mono` or `.tabular` (tabular nums)
- **Cards / panels**: `bg-card text-card-foreground border border-border rounded-xl`
- **Sticky header**: add `glass` utility for the frosted look
- **Bull / Bear coloring**: use `text-bull` and `text-bear` (semantic, theme-aware)
- **Never hardcode colors** like `text-white`, `bg-black`, `text-green-500`. Always use semantic tokens.

---

## Don'ts

- Don't import emoji-style logos or PNGs at small sizes — always use the SVG `<Logo />` component.
- Don't change brand color hex values. If a new shade is needed, add a token in `styles.css` first.
- Don't use Inter for headings or Space Grotesk for body — the contrast between the two is the brand.

---

Questions or need a portal-specific component (sidebar, dashboard card, table row)?
Ping the marketing site team and we'll port it over.
