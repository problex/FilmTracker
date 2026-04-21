import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const devApiTarget = process.env.VITE_DEV_API_PROXY ?? "http://127.0.0.1:4000";
const previewApiTarget = process.env.VITE_PREVIEW_API_PROXY ?? "http://127.0.0.1:4000";

/** Hostnames Vite may answer to (reverse-proxy Host header). Comma-separated, or "all"/"true" for any. Default: all (set VITE_ALLOWED_HOSTS to restrict). */
function viteAllowedHosts(): string[] | true {
  const raw = process.env.VITE_ALLOWED_HOSTS?.trim();
  if (!raw || raw === "all" || raw === "true") return true;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: viteAllowedHosts(),
    port: 5173,
    proxy: {
      "/api": {
        target: devApiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    allowedHosts: viteAllowedHosts(),
    port: 5173,
    proxy: {
      "/api": {
        target: previewApiTarget,
        changeOrigin: true,
      },
    },
  },
});

