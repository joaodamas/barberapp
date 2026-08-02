import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `lib/` é a saída do tsc: sem excluir, o vitest roda o teste compilado.
    include: ["src/**/*.test.ts"],
    exclude: ["lib/**", "node_modules/**"],
  },
});
