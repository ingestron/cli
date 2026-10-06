import { Command } from "commander";
import { check, Problem } from "@ingestron/core/adapter";
interface SchedulerHost {
  invoke: (
    operation: string,
    args: unknown,
    permissions: { write: boolean; execute: boolean },
  ) => Promise<void>;
}
const count = (name: string, min: number, max: number) => (value: string) => {
  const parsed = Number(value);
  check(
    /^(0|[1-9]\d*)$/.test(value) &&
      Number.isSafeInteger(parsed) &&
      parsed >= min &&
      parsed <= max,
    "INPUT",
    `${name} must be an integer between ${min} and ${max}`,
  );
  return parsed;
};
function reviewedDigests(value: string) {
  check(
    Buffer.byteLength(value) <= 32768,
    "LIMIT",
    "Reviewed digest map exceeds 32 KiB",
  );
  let map: unknown;
  try {
    map = JSON.parse(value);
  } catch {
    throw new Problem(
      "INPUT",
      "Expected a JSON object of reviewed flow digests",
    );
  }
  check(
    !!map && typeof map === "object" && !Array.isArray(map),
    "INPUT",
    "Expected a JSON object of reviewed flow digests",
  );
  return map;
}
/** Terminal grammar only; registration, claims, clock and source execution belong to core. */
export function schedulerCommands(app: Command, host: SchedulerHost) {
  const schedule = app
    .command("schedule")
    .description("Inspect, register and recover reviewed local schedules");
  const mutate = (command: Command) =>
    command
      .option("--allow-write", "Permit schedule journal changes")
      .option(
        "--allow-execute",
        "Permit local runtime execution and worker control",
      );
  const call = (
    name: string,
    args: unknown,
    flags: any = {},
    write = false,
  ) => {
    check(
      !write || (flags.allowWrite && flags.allowExecute),
      "PERMISSION",
      "Schedule changes require --allow-write and --allow-execute",
    );
    return host.invoke(name, args, {
      write: write && !!flags.allowWrite,
      execute: write && !!flags.allowExecute,
    });
  };
  const build = (command: Command) =>
    command
      .option(
        "--from <directory>",
        "Reviewed managed build inside the project",
        "build/generated",
      )
      .option("--profile <name>", "Selected local execution profile");
  const digest = (command: Command) =>
    command.requiredOption(
      "--expected-digest <sha256>",
      "Registration digest from schedule inspect --json",
    );
  build(
    schedule
      .command("inspect <flow>")
      .description("Review a current build and its registration digest"),
  ).action((flow, flags) =>
    call("scheduler_inspect", {
      flow,
      from: flags.from,
      ...(flags.profile ? { profile: flags.profile } : {}),
    }),
  );
  schedule
    .command("status <flow>")
    .description("Read current durable schedule state")
    .action((flow) => call("scheduler_status", { flow }));
  schedule
    .command("history <flow>")
    .description("Browse current or archived occurrence history")
    .option(
      "--generation <id>",
      "Current registration or an archived generation ID",
      "current",
    )
    .option(
      "--status <state>",
      "all, open, queued, running, succeeded, failed, interrupted, canceled or skipped",
      "all",
    )
    .option(
      "--query <text>",
      "Search run identity, date or safe error code",
      "",
    )
    .option("--page <number>", "Zero-based page", count("Page", 0, 999), 0)
    .option(
      "--page-size <count>",
      "Occurrences per page",
      count("Page size", 10, 100),
      20,
    )
    .action((flow, flags) =>
      call("scheduler_history", {
        flow,
        generation: flags.generation,
        status: flags.status,
        query: flags.query,
        page: flags.page,
        pageSize: flags.pageSize,
      }),
    );
  mutate(
    digest(
      build(
        schedule
          .command("register <flow>")
          .description("Register or resume the exact reviewed build"),
      ),
    ),
  )
    .option(
      "--grace-seconds <seconds>",
      "Reviewed late-dispatch grace",
      count("Grace", 0, 3600),
      60,
    )
    .action((flow, flags) =>
      call(
        "scheduler_register",
        {
          flow,
          from: flags.from,
          ...(flags.profile ? { profile: flags.profile } : {}),
          expectedDigest: flags.expectedDigest,
          graceSeconds: flags.graceSeconds,
        },
        flags,
        true,
      ),
    );
  mutate(
    schedule
      .command("tick <flow>")
      .description("Dispatch a bounded number of due occurrences"),
  )
    .option(
      "--limit <count>",
      "Maximum occurrences this tick",
      count("Limit", 1, 20),
      1,
    )
    .option("--env-file <file>", "Project-relative source environment file")
    .action((flow, flags) =>
      call(
        "scheduler_tick",
        {
          flow,
          limit: flags.limit,
          ...(flags.envFile ? { envFile: flags.envFile } : {}),
        },
        flags,
        true,
      ),
    );
  mutate(
    digest(
      schedule
        .command("pause <flow>")
        .description("Stop new starts without deleting the definition"),
    ),
  ).action((flow, flags) =>
    call(
      "scheduler_pause",
      { flow, expectedDigest: flags.expectedDigest },
      flags,
      true,
    ),
  );
  mutate(
    digest(
      schedule
        .command("cancel <flow> <occurrence>")
        .description("Cancel one queued occurrence"),
    ),
  ).action((flow, occurrence, flags) =>
    call(
      "scheduler_cancel",
      { flow, occurrence, expectedDigest: flags.expectedDigest },
      flags,
      true,
    ),
  );
  mutate(
    digest(
      schedule
        .command("retry <flow> <occurrence>")
        .description("Recover the same failed or interrupted business run"),
    ),
  )
    .option("--env-file <file>", "Project-relative source environment file")
    .action((flow, occurrence, flags) =>
      call(
        "scheduler_retry",
        {
          flow,
          occurrence,
          expectedDigest: flags.expectedDigest,
          ...(flags.envFile ? { envFile: flags.envFile } : {}),
        },
        flags,
        true,
      ),
    );
  const worker = schedule
    .command("worker")
    .description("Control persistent local dispatch workers");
  mutate(
    worker
      .command("start <flows...>")
      .description("Start a worker for exact reviewed flow registrations"),
  )
    .option(
      "--expected-digest <sha256>",
      "Reviewed registration digest for one flow",
    )
    .option(
      "--expected-digests <json>",
      "Reviewed flow-to-digest JSON object for multiple flows",
    )
    .option(
      "--poll-seconds <seconds>",
      "Seconds between checks",
      count("Polling interval", 1, 60),
      5,
    )
    .option(
      "--limit <count>",
      "Maximum occurrences per flow per tick",
      count("Limit", 1, 20),
      1,
    )
    .option(
      "--env-file <file>",
      "Persistent project-relative source environment file",
    )
    .action((flows, flags) => {
      check(
        !!flags.expectedDigest !== !!flags.expectedDigests &&
          (!flags.expectedDigest || flows.length === 1),
        "INPUT",
        "Supply one reviewed digest for one flow, or an exact reviewed flow-to-digest map",
      );
      const expectedDigests = flags.expectedDigest
        ? { [flows[0]]: flags.expectedDigest }
        : reviewedDigests(flags.expectedDigests);
      return call(
        "scheduler_worker_start",
        {
          flows,
          expectedDigests,
          pollSeconds: flags.pollSeconds,
          limit: flags.limit,
          ...(flags.envFile ? { envFile: flags.envFile } : {}),
        },
        flags,
        true,
      );
    });
  worker
    .command("status")
    .description("Read workers in the selected environment")
    .option("--id <uuid>", "Inspect one exact worker identity")
    .action((flags) =>
      call("scheduler_worker_status", flags.id ? { id: flags.id } : {}),
    );
  mutate(
    worker
      .command("stop <id>")
      .description("Request authenticated worker interruption or drain"),
  )
    .option("--drain", "Finish the current source run before stopping")
    .action((id, flags) =>
      call(
        "scheduler_worker_stop",
        { id, interrupt: !flags.drain },
        flags,
        true,
      ),
    );
}
