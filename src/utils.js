import { env } from "node:process";

/**
 * @param {string} msg
 * @param {any[]} args
 * @returns {never}
 */
export function shouldNeverHappen(msg, ...args) {
  console.error(msg, ...args);
  if (isDevEnv()) {
    debugger;
  }
  throw new Error(`This should never happen: ${msg}`);
}

export function isDevEnv() {
  return env.IS_DEV === "true";
}
