/** Keep package-network work off the presentation thread so progress reflects
 * actual pending work. This worker uses the same JSON operations as MCP/Web. */
import { parentPort, workerData } from "node:worker_threads";
import { executePluginOperation } from "./plugin-resolution.js";
parentPort!.postMessage(
  await executePluginOperation(
    workerData.context,
    workerData.operation,
    workerData.args,
  ),
);
