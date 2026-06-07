// eslint-config-next@16 ships a native flat config (Linter.Config[]) — spread
// it directly. No FlatCompat bridge (that triggers a circular-JSON crash under
// ESLint 9 flat config).
import next from "eslint-config-next";

const eslintConfig = [
  ...next,
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
