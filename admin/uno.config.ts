import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { darkTheme, lightTheme } from '@fantastic-admin/themes'
import { entriesToCss, toArray } from '@unocss/core'
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetWind4,
  transformerCompileClass,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'
import { presetAnimations } from 'unocss-preset-animations'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  content: {
    pipeline: {
      include: [
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/,
        'src/**/*.{js,ts}',
        path.resolve(projectRoot, 'packages/components/**/*.{vue,js,ts}'),
      ],
    },
  },
  shortcuts: [
    /* HOAI 页面壳层：扁平、细边框、极弱 elevation（与设计系统一致） */
    ['hoai-page-shell', 'rounded-[length:var(--radius)] border border-border/90 bg-card ring-1 ring-border/40 shadow-[0_1px_2px_0_oklch(0_0_0/0.04)] transition-[box-shadow,border-color] duration-200'],
    ['hoai-elevate-md', 'hoai-page-shell'],
    ['hoai-page-header-bar', 'border-b border-border/80 bg-background/95 px-5 py-4 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 sm:px-6'],
    ['hoai-page-header', 'hoai-page-header-bar'],
    ['hoai-icon-pill', 'flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 transition-colors duration-200'],
    [/^flex-?(col)?-(start|end|center|baseline|stretch)-?(start|end|center|between|around|evenly|left|right)?$/, ([, col, items, justify]) => {
      const cls = ['flex']
      if (col === 'col') {
        cls.push('flex-col')
      }
      if (items === 'center' && !justify) {
        cls.push('items-center')
        cls.push('justify-center')
      }
      else {
        cls.push(`items-${items}`)
        if (justify) {
          cls.push(`justify-${justify}`)
        }
      }
      return cls.join(' ')
    }],
  ],
  presets: [
    presetWind4(),
    presetAnimations(),
    presetAttributify(),
    presetIcons({
      collectionsNodeResolvePath: projectRoot,
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    }),
    presetTypography(),
    {
      name: 'unocss-preset-shadcn',
      preflights: [
        {
          getCSS: () => {
            const returnCss = [
              toArray(':root').map(root => `${root}{color-scheme:light;${entriesToCss(Object.entries(lightTheme))}}`).join(''),
              toArray('.dark').map(root => `${root}{color-scheme:dark;${entriesToCss(Object.entries(darkTheme))}}`).join(''),
            ]
            return `
${returnCss.join('\n')}

::selection {
  color: oklch(var(--primary-foreground));
  background-color: oklch(var(--primary));
}

* {
  border-color: oklch(var(--border));
  scrollbar-color: oklch(var(--border)) transparent;
  scrollbar-width: thin;
}

body {
  font-family: 'Plus Jakarta Sans', 'Fira Sans', ui-sans-serif, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: oklch(var(--foreground));
  background: oklch(var(--background));
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

button:not(:disabled),
[role="button"]:not(:disabled) {
  cursor: pointer;
}
`
          },
        },
      ],
      theme: {
        colors: {
          background: 'oklch(var(--background))',
          foreground: 'oklch(var(--foreground))',
          card: {
            DEFAULT: 'oklch(var(--card))',
            foreground: 'oklch(var(--card-foreground))',
          },
          popover: {
            DEFAULT: 'oklch(var(--popover))',
            foreground: 'oklch(var(--popover-foreground))',
          },
          primary: {
            DEFAULT: 'oklch(var(--primary))',
            foreground: 'oklch(var(--primary-foreground))',
          },
          secondary: {
            DEFAULT: 'oklch(var(--secondary))',
            foreground: 'oklch(var(--secondary-foreground))',
          },
          muted: {
            DEFAULT: 'oklch(var(--muted))',
            foreground: 'oklch(var(--muted-foreground))',
          },
          accent: {
            DEFAULT: 'oklch(var(--accent))',
            foreground: 'oklch(var(--accent-foreground))',
          },
          destructive: 'oklch(var(--destructive))',
          border: 'oklch(var(--border))',
          input: 'oklch(var(--input))',
          ring: 'oklch(var(--ring))',
        },
        radius: {
          xl: 'calc(var(--radius) + 4px)',
          lg: 'var(--radius)',
          md: 'calc(var(--radius) - 2px)',
          sm: 'calc(var(--radius) - 4px)',
        },
      },
    },
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
    transformerCompileClass(),
  ],
  configDeps: [
    path.resolve(projectRoot, 'packages/themes/index.ts'),
  ],
})
