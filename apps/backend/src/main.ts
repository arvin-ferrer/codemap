import * as path from 'node:path';
import { startReviewServer } from './review/server';

async function bootstrap() {
  const server = await startReviewServer({
    root: process.env.WORKSPACE_ROOT ?? process.cwd(),
    base: process.env.CODEMAP_BASE ?? 'main',
    assets: path.resolve(__dirname, '../../frontend/out'),
  });
  console.log(`CodeMap review: ${server.url}`);
  const stop = () => {
    void server.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
void bootstrap().catch(() => {
  console.error(
    'Could not start CodeMap. Run the CLI from a Git root with a valid --base.',
  );
  process.exitCode = 1;
});
