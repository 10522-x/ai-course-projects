import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: "index.html", studio: "model-studio.html" },
      output: {
        manualChunks(id) {
          if (
            id.includes("/node_modules/three/src/") ||
            id.includes("/node_modules/three/build/")
          )
            return "three";
          if (id.includes("/node_modules/three/examples/"))
            return "three-addons";
        },
      },
    },
  },
});
