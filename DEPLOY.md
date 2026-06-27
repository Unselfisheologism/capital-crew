# Cloudflare Pages deploy
Run from repo root:
npx wrangler pages project upload capital-crew ./dist

Notes:
- Pages build config expects output dir `dist` (wrangler.toml has pages_build_output_dir = "dist").
- If Pages is using a root directory override, confirm the build input root is the repo root and the publish dir is `dist`.
- For a Pull-from-GitHub Pages setup, the commit `f654e13` contains the latest push.
