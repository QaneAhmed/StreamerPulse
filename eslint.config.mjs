import next from "eslint-config-next";

export default [
  ...next,
  {
    ignores: ["worker/dist/**", "worker/node_modules/**"],
  },
];
