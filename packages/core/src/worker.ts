import { parentPort, workerData } from "node:worker_threads";
import { captureReview, type ReviewOptions } from "./index";
import { cancelGitCommands } from "./git";
parentPort?.on("message", (message) => {
  if (message === "CANCEL") {
    cancelGitCommands();
    parentPort?.postMessage({ cancelled: true });
  }
});
void captureReview(workerData as ReviewOptions).then(
  (review) => parentPort?.postMessage({ review }),
  (error) =>
    parentPort?.postMessage({
      error: error instanceof Error ? error.message : "Review failed.",
    }),
);
