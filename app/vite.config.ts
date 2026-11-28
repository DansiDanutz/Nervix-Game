import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

type Command = "serve" | "build";

/**
 * The Nervix World API the dev server proxies to. There is deliberately no
 * default: port 8787 belongs to another service on this machine, so a dev or
 * test run must name its own API (Playwright sets VITE_API_TARGET).
 */
export function apiTarget(env: Record<string, string | undefined>, command: Command): string {
  const target = env.VITE_API_TARGET?.trim();
  if (target) return target;
  if (command === "serve") {
    throw new Error("Set VITE_API_TARGET to the Nervix World API (for example http://127.0.0.1:28797). There is no default port. `vite preview` reuses the same /api and /presence proxy, so it needs it too.");
  }
  return "";
}

export default defineConfig(({ command }) => {
  const target = apiTarget(process.env, command);
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target,
          changeOrigin: true,
          cookieDomainRewrite: "localhost",
          rewrite: (p: string) => p.replace(/^\/api/, ""),
        },
        // Same-origin WebSocket, so the HttpOnly session cookie reaches the
        // presence upgrade and the server can bind the connection to it.
        "/presence": {
          target,
          ws: true,
          changeOrigin: true,
        },
      },
    },
    build: {
      target: "es2022",
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            three: ["three", "@react-three/fiber", "@react-three/drei"],
            react: ["react", "react-dom"],
          },
        },
      },
    },
  };
});
