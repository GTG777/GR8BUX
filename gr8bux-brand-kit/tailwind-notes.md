# Tailwind setup notes

## Option A — Tailwind v4 (recommended, matches the marketing site)

```bash
npm i tailwindcss@latest @tailwindcss/vite@latest tw-animate-css
```

`vite.config.ts`:
```ts
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({ plugins: [tailwindcss(), /* react etc */] });
```

That's it — no `tailwind.config.js` needed. The provided `styles.css` declares
all tokens via `@theme inline`, so classes like `bg-primary`, `text-brand-green`,
`bg-gradient-brand`, `font-display` work automatically.

Import the stylesheet once in your app entry:
```ts
import "./styles.css";
```

## Option B — Stay on Tailwind v3

You'll need to (a) keep your existing PostCSS/Tailwind setup, and (b) mirror
the tokens in `tailwind.config.js`. Minimal mapping:

```js
// tailwind.config.js
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
        secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        accent: { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
        destructive: { DEFAULT: "var(--destructive)", foreground: "var(--destructive-foreground)" },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        "brand-green": "var(--brand-green)",
        "brand-blue": "var(--brand-blue)",
        "brand-navy": "var(--brand-navy)",
        bull: "var(--bull)",
        bear: "var(--bear)",
        surface: { DEFAULT: "var(--surface)", foreground: "var(--surface-foreground)" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
};
```

Then strip the `@import "tailwindcss" source(none);`, `@theme inline { ... }`,
and `@custom-variant` blocks from `styles.css` (v3 doesn't understand them) but
**keep all the `:root { ... }`, `.dark { ... }`, and `@layer utilities { ... }`
sections** — those are pure CSS and work in both versions.
