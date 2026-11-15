import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Nested git worktrees under `.worktrees/` are full copies of this repo and must not be
    // collected: they inflate the file/test counts and can carry their own stale configs.
    // Vitest replaces its defaults when `exclude` is set, so the standard defaults are
    // spelled out here alongside the worktree pattern.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      '**/.worktrees/**',
    ],
  },
})
