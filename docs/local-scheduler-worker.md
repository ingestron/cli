# Run a local schedule worker

Use a persistent worker to dispatch reviewed local flows after the launching CLI
exits. This guide describes the private CLI0.17.14/core0.12.30 candidate. The
published CLI still pins core0.12.14 and does not provide these operations.

Start with a saved portable schedule and a current managed build. Prepare the
locked local Python runtime, discover the selected tables, review their contracts
and approve the source review. The tested source is files1.5.8 with local0.4.10.
Use Node22.13 or newer on POSIX. The examples run from the directory containing
your `retail` project. Replace `bronze` with its flow name and each placeholder
with the value returned by the preceding command.

1. Inspect the managed build and save the returned registration `digest`:

   ```sh
   ingestron --project ./retail --json --no-input schedule inspect bronze --from build/generated
   ```

2. Register that exact digest. Both permissions are required for every schedule
   or worker change:

   ```sh
   ingestron --project ./retail --no-input schedule register bronze --from build/generated --expected-digest YOUR_REVIEWED_DIGEST --allow-write --allow-execute
   ```

3. Start the worker with the registered digest:

   ```sh
   ingestron --project ./retail --json --no-input schedule worker start bronze --expected-digest YOUR_REVIEWED_DIGEST --allow-write --allow-execute
   ```

   Save the returned `worker.id`. The command exits while the worker continues.
   It checks for due work every five seconds and dispatches at most one occurrence
   per flow per tick by default. For several registered flows, provide each exact
   digest in a JSON object:

   ```sh
   ingestron --project ./retail --json --no-input schedule worker start bronze customers --expected-digests '{"bronze":"BRONZE_REVIEWED_DIGEST","customers":"CUSTOMERS_REVIEWED_DIGEST"}' --allow-write --allow-execute
   ```

   Replace both digest placeholders. Use `--poll-seconds` from 1 to 60 and
   `--limit` from 1 to 20 to change these bounds. If the source needs an environment
   file, add `--env-file private.env` with its project-relative path. Keep that
   file available for the lifetime of the worker.

4. Inspect workers without execution permission:

   ```sh
   ingestron --project ./retail --no-input schedule worker status
   ingestron --project ./retail --json --no-input schedule worker status --id YOUR_WORKER_ID
   ```

   The normal summary shows bounded per-flow health and occurrence counts. JSON
   includes the complete worker result and whether its process is alive.

5. Drain the current source run before stopping:

   ```sh
   ingestron --project ./retail --no-input schedule worker stop YOUR_WORKER_ID --drain --allow-write --allow-execute
   ```

   Without `--drain`, stop interrupts the current run. Inspect worker status until
   it reaches `stopped` and is no longer alive. A stop request being accepted is
   separate from the worker completing its shutdown.

## Recover failed work

A failed source occurrence remains claimed. The worker does not retry that
business work automatically. Find its original occurrence ID in history, correct
the source failure, then recover the same occurrence with its registration digest:

```sh
ingestron --project ./retail --no-input schedule history bronze --status failed
ingestron --project ./retail --no-input schedule retry bronze ORIGINAL_OCCURRENCE_ID --expected-digest YOUR_REVIEWED_DIGEST --allow-write --allow-execute
```

Retry retains the business run identity and records another attempt. A finite
`schedule tick bronze --limit 1 --allow-write --allow-execute` also reports failed
work with a failing exit code. Its JSON retains the operation result and individual
outcomes. Keep source credentials in the project-relative environment file rather
than command arguments.

Each worker owns its selected flow drivers. Starting another for an owned flow
is refused. `schedule pause bronze --expected-digest YOUR_REVIEWED_DIGEST
--allow-write --allow-execute` stops new work for that flow; the worker remains
available for inspection and stop. Register the unchanged digest again to resume.
If the reviewed registration changes, stop the old driver and review its replacement.
If a worker is killed, stop its lost driver explicitly and recover its original
uncertain occurrence before continuing. A historical worker ID cannot stop a later
worker. `schedule cancel bronze QUEUED_OCCURRENCE_ID --expected-digest
YOUR_REVIEWED_DIGEST --allow-write --allow-execute` cancels one queued occurrence.

## Browse current and archived history

```sh
ingestron --project ./retail --no-input schedule history bronze --status failed --query RUNTIME --page 0 --page-size 20
ingestron --project ./retail --json --no-input schedule history bronze
```

The default summary retains run IDs, statuses, attempts and safe error codes.
Use the JSON `generations` list to find an archived registration, then add
`--generation ARCHIVED_GENERATION_ID` to inspect it. `--query` searches run ID,
occurrence date or error code. Pages start at zero; page size ranges from 10 to 100. Archived results are read-only and belong to their original project,
environment and flow. History and worker status remain available when the current
definitions or build are broken. `schedule status bronze` reads the current
registration's durable state.

An active or uncertain source run also owns its managed build. Generation into
that directory and overlapping flow execution are refused before mutation, with
the original run ID in the diagnostic. A stopped driver does not imply that its
source process has stopped. Use the scheduled occurrence's explicit recovery
above; its retained source group must finish before ownership can transfer.
Rebuilding is available after recovery completes. Independent build directories
can still be generated offline; this does not qualify shared remote targets.

MCP exposes worker inspection and history read-only. Start and stop are exposed
only when both execution and write permissions are enabled on the MCP server.
The private shared Studio interface includes worker lifecycle controls and paged
history. Actual file-route acceptance covers both an idle driver
and a driver killed while its source child remains active. Explicit recovery
retains the original business run and committed output; other source routes need
their own qualification.
