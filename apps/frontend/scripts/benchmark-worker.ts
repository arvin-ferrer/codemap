import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';
import { performance } from 'perf_hooks';

interface SimNode extends SimulationNodeDatum {
  id: string;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

function runBenchmark() {
  console.log('--- Starting 1,000 Node Physics Benchmark ---');
  
  const NODE_COUNT = 1000;
  const LINK_COUNT = 2000;
  
  const nodes: SimNode[] = Array.from({ length: NODE_COUNT }, (_, i) => ({ id: `node-${i}` }));
  const links: SimLink[] = Array.from({ length: LINK_COUNT }, () => ({
    source: `node-${Math.floor(Math.random() * NODE_COUNT)}`,
    target: `node-${Math.floor(Math.random() * NODE_COUNT)}`
  }));

  const startMemory = process.memoryUsage().heapUsed;
  const startTime = performance.now();

  const simulation = forceSimulation<SimNode>(nodes)
    .force('charge', forceManyBody<SimNode>().strength(-200))
    .force('link', forceLink<SimNode, SimLink>(links).id(d => d.id).distance(80))
    .force('center', forceCenter<SimNode>(500, 500))
    .force('collide', forceCollide<SimNode>(15))
    .stop(); // Stop automatic ticking to measure manually

  console.log(`Initialized simulation with ${NODE_COUNT} nodes and ${LINK_COUNT} links.`);

  let totalTickTime = 0;
  const TICK_COUNT = 100; // Simulate 100 frames (~1.6 seconds at 60fps)

  for (let i = 0; i < TICK_COUNT; i++) {
    const tickStart = performance.now();
    simulation.tick();
    
    // Simulate Float32Array extraction as worker does
    const positions = new Float32Array(nodes.length * 2);
    for (let j = 0; j < nodes.length; j++) {
      positions[j * 2] = nodes[j].x ?? 0;
      positions[j * 2 + 1] = nodes[j].y ?? 0;
    }
    
    const tickEnd = performance.now();
    totalTickTime += (tickEnd - tickStart);
  }

  const endTime = performance.now();
  const endMemory = process.memoryUsage().heapUsed;

  const avgTickTime = totalTickTime / TICK_COUNT;
  const memoryUsedMB = (endMemory - startMemory) / 1024 / 1024;

  console.log(`\n--- Benchmark Results ---`);
  console.log(`Total elapsed time for ${TICK_COUNT} ticks: ${(endTime - startTime).toFixed(2)}ms`);
  console.log(`Average frame time (tick + serialization): ${avgTickTime.toFixed(2)}ms`);
  console.log(`Estimated FPS capability: ${Math.floor(1000 / avgTickTime)} FPS`);
  console.log(`Heap usage delta: ${memoryUsedMB.toFixed(2)} MB`);

  if (avgTickTime > 16.6) {
    console.warn('\n⚠️ WARNING: Average tick time exceeds 16.6ms (sub-60 FPS). Optimization required.');
    process.exit(1);
  } else {
    console.log('\n✅ PASS: Average tick time is well under the 16.6ms threshold (60 FPS maintained).');
    process.exit(0);
  }
}

runBenchmark();
