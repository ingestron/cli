import { Worker } from "node:worker_threads";
import type { Context, OperationName, Result } from "@ingestron/core";
export interface Presentation {
  tty: boolean;
  plain?: boolean;
  colour?: boolean;
  progress?: boolean;
  json?: boolean;
}
export function richTerminal(options: Presentation, env = process.env) {
  return (
    options.tty &&
    !options.json &&
    !options.plain &&
    options.colour !== false &&
    env.NO_COLOR === undefined &&
    env.TERM !== "dumb" &&
    !env.CI
  );
}
export function decorate(
  text: string,
  ok: boolean,
  options: Presentation,
): string {
  if (!richTerminal(options)) return text;
  const [title, ...body] = text.split("\n");
  return `\x1b[${ok ? "32" : "31"}m${ok ? "[ok]" : "[!]"}\x1b[0m \x1b[1m${title}\x1b[0m${body.length ? "\n" + body.join("\n") : ""}`;
}
export function banner(text: string, options: Presentation) {
  return richTerminal(options)
    ? `\x1b[36m+-- INGESTRON ----------------------------------+\x1b[0m\n\n${text}`
    : text;
}
export async function backgroundOperation(
  context: Context,
  operation: OperationName,
  args: unknown,
  label: string,
  options: Presentation,
): Promise<Result> {
  const animate =
    richTerminal(options) &&
    options.progress !== false &&
    process.env.INGESTRON_NO_ANIMATION !== "1" &&
    !!process.stderr.isTTY;
  const frames = ["|", "/", "-", "\\"];
  let index = 0;
  const safe = label
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .slice(0, Math.max(20, (process.stderr.columns ?? 80) - 8));
  const draw = () =>
    process.stderr.write(
      `\r\x1b[2K  ${frames[index++ % frames.length]} ${safe}`,
    );
  if (animate) draw();
  const timer = animate ? setInterval(draw, 100) : undefined;
  try {
    return await new Promise<Result>((resolve, reject) => {
      const worker = new Worker(
        new URL("./operation-worker.js", import.meta.url),
        { workerData: { context, operation, args } },
      );
      let received = false;
      worker.once("message", (result) => {
        received = true;
        resolve(result);
      });
      worker.once("error", reject);
      worker.once("exit", (code) => {
        if (!received) reject(new Error(`Operation worker stopped (${code})`));
      });
    });
  } finally {
    if (timer) clearInterval(timer);
    if (animate) process.stderr.write("\r\x1b[2K");
  }
}
