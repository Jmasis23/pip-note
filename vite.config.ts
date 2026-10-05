import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react(), tailwind()], base: "./", clearScreen: false,
  resolve: { alias: { "@": fileURLToPath(new URL("./src/bui", import.meta.url)) } },
  server: { port: 1420, strictPort: true }, test: { environment: "node" },
} as never);
