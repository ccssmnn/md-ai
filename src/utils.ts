import { env } from "node:process";

/**
 * @param {string} msg
 * @param {any[]} args
 * @returns {never}
 */
export function shouldNeverHappen(msg: string, ...args: any[]): never {
  console.error(msg, ...args);
  if (isDevEnv()) {
    debugger;
  }
  throw new Error(`This should never happen: ${msg}`);
}

export function isDevEnv(): boolean {
  return env.IS_DEV === "true";
}
