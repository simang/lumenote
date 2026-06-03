import { runFullSync } from "./ingest";
import { withTransaction } from "./db";
import {
  claimNextQueuedIngestJob,
  finishIngestJob,
  type IngestJob,
} from "./repositories";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function runNextIngestJob(input: { userId?: string; siteId?: string } = {}) {
  const job = await withTransaction((client) => claimNextQueuedIngestJob(client, input));
  if (!job) {
    return {
      processed: false as const,
      job: null,
    };
  }

  try {
    const result = await runFullSync({
      siteId: job.site_id,
      ref: job.ref ?? undefined,
      trigger: job.trigger,
    });

    const finished = await finishIngestJob(job.id, {
      status: "completed",
      ingestRunId: result.ingest_run_id,
      summary: result.summary,
    });

    return {
      processed: true as const,
      job: finished,
      result,
    };
  } catch (error) {
    const finished = await finishIngestJob(job.id, {
      status: "failed",
      summary: { errors: [{ path: "*", message: errorMessage(error) }] },
      error: errorMessage(error),
    });

    return {
      processed: true as const,
      job: finished,
      error: errorMessage(error),
    };
  }
}

export function activeJobLabel(job: Pick<IngestJob, "status" | "created_at">) {
  return `${job.status} since ${job.created_at.toISOString()}`;
}
