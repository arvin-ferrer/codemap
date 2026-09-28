import { Worker } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import ts from "typescript";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from "d3-force";
import { quadtree } from "d3-quadtree";

const require = createRequire(import.meta.url);
const fixture = () => ({
  nodes: Array.from({ length: 1000 }, (_, i) => ({
    id: `node-${i}`,
    name: `node-${i}.ts`,
    type: "ts",
    size: 100,
    lines: 1,
  })),
  links: Array.from({ length: 3000 }, (_, i) => ({
    source: `node-${i % 1000}`,
    target: `node-${(i * 37 + Math.floor(i / 1000) * 113 + 1) % 1000}`,
    relation: "static-import",
  })),
});
const { nodes, links } = fixture();
const startHeap = process.memoryUsage().heapUsed;
const sim = forceSimulation(nodes)
  .force("charge", forceManyBody().strength(-200))
  .force(
    "link",
    forceLink(links)
      .id((n) => n.id)
      .distance(80),
  )
  .force("center", forceCenter(500, 500))
  .force("collide", forceCollide(15))
  .stop();
const times = [];
for (let i = 0; i < 120; i++) {
  const start = performance.now();
  sim.tick();
  const positions = new Float32Array(nodes.length * 2);
  nodes.forEach((n, index) => {
    positions[index * 2] = n.x;
    positions[index * 2 + 1] = n.y;
  });
  if (i >= 20) times.push(performance.now() - start);
}
const tree = quadtree()
  .x((n) => n.x)
  .y((n) => n.y)
  .addAll(nodes);
const hover = [];
for (const node of nodes) {
  const start = performance.now();
  tree.find(node.x, node.y, 15);
  hover.push(performance.now() - start);
}
const source = await readFile(
  new URL("../src/workers/simulation.worker.ts", import.meta.url),
  "utf8",
);
const compiled = ts
  .transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace(
    '"d3-force"',
    JSON.stringify(pathToFileURL(require.resolve("d3-force")).href),
  );
const wrapper = `import { parentPort } from 'node:worker_threads'; globalThis.self = { postMessage: (message, transfer) => parentPort.postMessage(message, transfer) };\n${compiled}\nparentPort.on('message', data => self.onmessage({data}));`;
const worker = new Worker(
  new URL("data:text/javascript," + encodeURIComponent(wrapper)),
);
let messages = 0;
let began = 0;
let elapsed = 0;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(
          new Error("Worker did not produce 100 ticks within 15 seconds."),
        ),
      15000,
    );
    worker.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    worker.on("message", (message) => {
      if (message.type !== "TICK") return;
      if (
        !(message.positions instanceof Float32Array) ||
        message.positions.length !== 2000
      ) {
        clearTimeout(timeout);
        reject(new Error("Invalid coordinate transfer"));
        return;
      }
      if (!began) began = performance.now();
      messages++;
      if (messages === 100) {
        elapsed = performance.now() - began;
        clearTimeout(timeout);
        resolve();
      }
    });
    worker.postMessage({ type: "INIT", ...fixture() });
    worker.postMessage({
      type: "UPDATE_DIMENSIONS",
      width: 1000,
      height: 1000,
    });
  });
} finally {
  await worker.terminate();
}
const percentile = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)];
const average = times.reduce((a, b) => a + b, 0) / times.length;
const rate = 99 / (elapsed / 1000);
const heap = (process.memoryUsage().heapUsed - startHeap) / 1024 / 1024;
console.log(
  JSON.stringify(
    {
      nodes: 1000,
      edges: 3000,
      averagePhysicsMs: average,
      p95PhysicsMs: percentile(times),
      p95HoverMs: percentile(hover),
      workerMessagesPerSecond: rate,
      mainProcessHeapDeltaMiB: heap,
      note: "CPU/worker regression fixture; not browser FPS or total worker heap.",
    },
    null,
    2,
  ),
);
if (
  average > 16.6 ||
  percentile(hover) >= 10 ||
  rate > 65 ||
  rate < 10 ||
  heap > 128
)
  process.exitCode = 1;
