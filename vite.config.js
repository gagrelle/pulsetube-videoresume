import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';
import { defineConfig } from 'vite';

/**
 * PulseTube AI — Vite config
 * - Lightning CSS: bundles the @import chain, transpiles nesting / light-dark() / oklch
 *   for the browserslist targets and minifies the output.
 * - Static SEO assets (favicon, robots, sitemap, manifest, OG image) live in /public.
 */
export default defineConfig({
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      targets: browserslistToTargets(browserslist())
    }
  },
  build: {
    cssMinify: 'lightningcss',
    target: 'es2022',
    assetsInlineLimit: 0
  },
  server: {
    open: true
  }
});

