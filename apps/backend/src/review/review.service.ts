import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import * as path from 'node:path';
import type { CapturedReview, ReviewOptions } from '@codemap/core';

export const REVIEW_OPTIONS = Symbol('REVIEW_OPTIONS');

@Injectable()
export class ReviewService implements OnModuleDestroy {
  private captured?: CapturedReview;
  private pending?: Promise<CapturedReview>;
  private worker?: Worker;
  private closed = false;

  constructor(
    @Inject(REVIEW_OPTIONS) private readonly options: ReviewOptions,
  ) {}

  current(): Promise<CapturedReview> {
    return this.captured ? Promise.resolve(this.captured) : this.refresh();
  }

  refresh(): Promise<CapturedReview> {
    if (this.closed)
      return Promise.reject(new Error('Review server is closed.'));
    if (this.pending) return this.pending;
    this.pending = new Promise<CapturedReview>((resolve, reject) => {
      const worker = new Worker(
        path.join(path.dirname(require.resolve('@codemap/core')), 'worker.js'),
        {
          workerData: this.options,
          resourceLimits: { maxOldGenerationSizeMb: 1024 },
        },
      );
      this.worker = worker;
      let finished = false;
      const timer = setTimeout(() => {
        finished = true;
        reject(new Error('Review exceeded its 60-second time budget.'));
        void this.stopWorker(worker);
      }, this.options.limits?.timeMs ?? 60000);
      worker.once(
        'message',
        (message: { review?: CapturedReview; error?: string }) => {
          clearTimeout(timer);
          if (finished || this.closed) return;
          finished = true;
          if (message.review) {
            this.captured = message.review;
            resolve(message.review);
          } else
            reject(new Error(message.error ?? 'Review could not be captured.'));
          void worker.terminate();
        },
      );
      worker.once('error', () => {
        clearTimeout(timer);
        reject(new Error('Review worker failed. Try a smaller repository.'));
      });
      worker.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('Review worker stopped before completing.'));
      });
    }).finally(() => {
      this.pending = undefined;
      this.worker = undefined;
    });
    return this.pending;
  }

  async onModuleDestroy() {
    this.closed = true;
    if (this.worker) await this.stopWorker(this.worker);
  }

  private async stopWorker(worker: Worker) {
    // Git is asynchronous: allow its cancellation handler to kill subprocesses
    // before forcibly terminating CPU-bound AST work.
    worker.postMessage('CANCEL');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 100);
      worker.once('message', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    await worker.terminate();
  }
}
