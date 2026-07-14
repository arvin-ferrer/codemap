/**
 * Web Worker: D3 Force-Directed Graph Simulation
 *
 * Runs all physics calculations off the main thread.
 * Communicates with the main thread via a typed postMessage protocol.
 */

import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { WorkerMessageInbound, WorkerMessageOutbound, CodeNode } from "@codemap/shared";

interface SimNode extends CodeNode, SimulationNodeDatum {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
  relation: string;
}

let simulation: Simulation<SimNode, SimLink> | null = null;
let nodes: SimNode[] = [];
let links: SimLink[] = [];
let width = 0;
let height = 0;

const CHARGE_STRENGTH = -200;
const LINK_DISTANCE = 80;
const COLLISION_RADIUS = 15;
const ALPHA_DECAY = 0.02;
const VELOCITY_DECAY = 0.4;

let lastBroadcast = 0;
const BROADCAST_INTERVAL_MS = 16; // ~60fps capped rate

function createSimulation(): Simulation<SimNode, SimLink> {
  const sim = forceSimulation<SimNode>(nodes)
    .alphaDecay(ALPHA_DECAY)
    .velocityDecay(VELOCITY_DECAY)
    .force("charge", forceManyBody<SimNode>().strength(CHARGE_STRENGTH))
    .force(
      "link",
      forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance(LINK_DISTANCE),
    )
    .force("center", forceCenter<SimNode>(width / 2, height / 2))
    .force("collide", forceCollide<SimNode>(COLLISION_RADIUS))
    .on("tick", broadcastTick);

  return sim;
}

function broadcastTick(): void {
  const now = performance.now();
  if (now - lastBroadcast < BROADCAST_INTERVAL_MS) {
    return;
  }
  lastBroadcast = now;

  const positions = new Float32Array(nodes.length * 2);
  for (let i = 0; i < nodes.length; i++) {
    positions[i * 2] = nodes[i].x ?? 0;
    positions[i * 2 + 1] = nodes[i].y ?? 0;
  }

  const isComplete = simulation ? simulation.alpha() < simulation.alphaMin() : true;
  const out: WorkerMessageOutbound = {
    type: "TICK",
    positions,
    isComplete,
  };
  
  // Bypass Window typings safely
  const workerSelf = self as unknown as { postMessage: (msg: unknown, transfer: ArrayBuffer[]) => void };
  workerSelf.postMessage(out, [positions.buffer]);
}

const DRAG_ALPHA_TARGET = 0.3;

function findNodeById(nodeId: string): SimNode | undefined {
  return nodes.find((n) => n.id === nodeId);
}

function handleDragStart(nodeId: string, x: number, y: number): void {
  if (!simulation) return;
  simulation.alphaTarget(DRAG_ALPHA_TARGET).restart();

  const node = findNodeById(nodeId);
  if (node) {
    node.fx = x;
    node.fy = y;
  }
}

function handleDrag(nodeId: string, x: number, y: number): void {
  const node = findNodeById(nodeId);
  if (node) {
    node.fx = x;
    node.fy = y;
  }
}

function handleDragEnd(nodeId: string): void {
  if (!simulation) return;
  simulation.alphaTarget(0);

  const node = findNodeById(nodeId);
  if (node) {
    node.fx = null;
    node.fy = null;
  }
}

self.onmessage = (event: MessageEvent<WorkerMessageInbound>) => {
  const msg = event.data;

  switch (msg.type) {
    case "INIT":
      nodes = msg.nodes.map(n => ({ ...n }));
      links = msg.links.map(l => ({ ...l }));

      if (simulation) {
        simulation.stop();
      }
      simulation = createSimulation();
      self.postMessage({ type: "INIT_DONE" } as WorkerMessageOutbound);
      break;

    case "UPDATE_DIMENSIONS":
      width = msg.width;
      height = msg.height;

      if (simulation) {
        simulation
          .force("center", forceCenter<SimNode>(width / 2, height / 2))
          .alpha(0.3)
          .restart();
      }
      break;

    case "DRAG_START":
      handleDragStart(msg.nodeId, msg.x, msg.y);
      break;

    case "DRAG":
      handleDrag(msg.nodeId, msg.x, msg.y);
      break;

    case "DRAG_END":
      handleDragEnd(msg.nodeId);
      break;
  }
};
