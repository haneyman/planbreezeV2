import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Interval } from "@nestjs/schedule";
import type { Model } from "mongoose";
import { randomUUID } from "node:crypto";
import type { Stored } from "../../../shared/types.js";
export interface Job extends Stored {
  kind: string;
  payload: Record<string, string>;
  state: string;
  attempts: number;
  runAt: Date;
  leaseUntil?: Date;
  leaseOwner?: string;
  dedupeKey?: string;
  error?: string;
}
@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private handlers = new Map<
    string,
    (payload: Record<string, string>) => Promise<unknown>
  >();
  private running = false;
  private logger = new Logger(JobsService.name);
  constructor(@InjectModel("jobs") private jobs: Model<Job>) {}
  register(
    kind: string,
    handler: (payload: Record<string, string>) => Promise<unknown>,
  ) {
    this.handlers.set(kind, handler);
  }
  async enqueue(
    kind: string,
    payload: Record<string, string>,
    dedupeKey?: string,
  ) {
    if (dedupeKey) {
      await this.jobs.updateOne(
        { dedupeKey },
        {
          $setOnInsert: {
            kind,
            payload,
            state: "pending",
            attempts: 0,
            runAt: new Date(),
          },
        },
        { upsert: true },
      );
    } else
      await this.jobs.create({
        kind,
        payload,
        state: "pending",
        attempts: 0,
        runAt: new Date(),
      });
  }
  async onApplicationBootstrap() {
    await this.jobs.init();
  }
  @Interval(1000)
  async tick() {
    if (this.running || process.env.JOBS_ENABLED === "false") return;
    this.running = true;
    try {
      for (let i = 0; i < 10; i++) {
        const leaseOwner = randomUUID();
        const job = await this.jobs
          .findOneAndUpdate(
            {
              $or: [
                { state: "pending", runAt: { $lte: new Date() } },
                { state: "running", leaseUntil: { $lt: new Date() } },
              ],
              attempts: { $lt: 5 },
            },
            {
              $set: {
                state: "running",
                leaseOwner,
                leaseUntil: new Date(Date.now() + 120000),
              },
              $inc: { attempts: 1 },
            },
            { returnDocument: "after", sort: { runAt: 1 } },
          )
          .lean();
        if (!job) break;
        const heartbeat = setInterval(() => {
          void this.jobs
            .updateOne(
              { _id: job._id, leaseOwner },
              { $set: { leaseUntil: new Date(Date.now() + 120000) } },
            )
            .catch(() => this.logger.error("Job lease renewal failed"));
        }, 30000);
        try {
          const handler = this.handlers.get(job.kind);
          if (!handler) throw new Error("Unknown job kind");
          await handler(job.payload);
          await this.jobs.updateOne(
            { _id: job._id, leaseOwner },
            {
              $set: { state: "done" },
              $unset: { payload: 1, error: 1, leaseUntil: 1, leaseOwner: 1 },
            },
          );
        } catch {
          await this.jobs.updateOne(
            { _id: job._id, leaseOwner },
            {
              $set: {
                state: job.attempts >= 5 ? "failed" : "pending",
                error: "Delivery failed; inspect integration configuration.",
                runAt: new Date(Date.now() + 1000 * 2 ** job.attempts),
              },
              $unset: { leaseOwner: 1, leaseUntil: 1 },
            },
          );
          this.logger.warn(`Job ${job.kind} failed (attempt ${job.attempts})`);
        } finally {
          clearInterval(heartbeat);
        }
      }
      // A worker killed during its final attempt must not leave an eternal running job.
      await this.jobs.updateMany(
        {
          state: "running",
          attempts: { $gte: 5 },
          leaseUntil: { $lt: new Date() },
        },
        { $set: { state: "failed" } },
      );
    } finally {
      this.running = false;
    }
  }
}
