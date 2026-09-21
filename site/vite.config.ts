import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Several Solana packages (and rpc-websockets) only declare "browser"/"node"
// export conditions, so they fail to resolve in some SSR/edge builds.
// Resolve those bare imports directly to their browser ESM build.
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
  server: {
    host: true,
    port: 3000,
  },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Use src/server.ts as the SSR entry (error-reporting wrapper).
      server: { entry: "server" },
    }),
    viteReact(),
    tailwindcss(),
    resolveBrowserBuild,
  ],
});
