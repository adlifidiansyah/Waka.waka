import next from "eslint-config-next";

/** eslint-config-next v16 ships a flat config array directly. */
const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...next,
];

export default eslintConfig;
