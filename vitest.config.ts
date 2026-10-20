import { defineConfig } from "vitest/config";

// The repository root also holds contracts/ (with OpenZeppelin's Hardhat tests) and scripts/satellite
// (its own suite): only the app's tests run here.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});
