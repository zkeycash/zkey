// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Several Solana packages (and rpc-websockets) only declare "browser"/"node"
// export conditions, so they fail to resolve in the workerd/edge build.
// Resolve those bare imports directly to their browser ESM build, which is
// Web-standard and runs fine on the edge runtime.
const resolveBrowserBuild = {
  name: "solana-browser-build-resolver",
  enforce: "pre" as const,
  resolveId(source: string) {
    if (!/^(@solana\/[^/]+|rpc-websockets)$/.test(source)) return null;
    for (const candidate of [
      `./node_modules/${source}/dist/index.browser.mjs`,
      `./node_modules/${source}/dist/index.browser.js`,
    ]) {
      const file = fileURLToPath(new URL(candidate, import.meta.url));
      if (existsSync(file)) return file;
    }
    return null;
  },
};

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [resolveBrowserBuild],
  },
});
