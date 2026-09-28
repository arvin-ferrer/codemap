import { startReviewServer } from './server';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import type { AddressInfo } from 'node:net';

describe('Local review server', () => {
  let root: string;
  let server: Awaited<ReturnType<typeof startReviewServer>>;
  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'codemap-api-'));
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, stdio: 'ignore' });
    git('init', '-b', 'main');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'CodeMap Test');
    await fs.writeFile(path.join(root, 'a.ts'), 'export const a = 1;');
    git('add', '.');
    git('commit', '-m', 'base');
    await fs.writeFile(path.join(root, 'a.ts'), 'export const a = 2;');
    await fs.mkdir(path.join(root, 'assets'));
    await fs.writeFile(
      path.join(root, 'assets/index.html'),
      '<html>review</html>',
    );
    server = await startReviewServer({
      root,
      base: 'main',
      assets: path.join(root, 'assets'),
    });
  }, 30000);
  afterAll(async () => {
    await server?.close();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });
  it('binds only to loopback and serves static UI', async () => {
    const http = server.app.getHttpServer();
    expect((http.address() as AddressInfo).address).toBe('127.0.0.1');
    expect(server.token).toHaveLength(64);
    await request(server.origin)
      .get('/')
      .expect(200)
      .expect('Referrer-Policy', 'no-referrer');
  });
  it('rejects missing credentials, foreign origins and forged hosts', async () => {
    await request(server.origin).get('/api/review').expect(401);
    await request(server.origin)
      .get('/api/review')
      .set('Authorization', 'Bearer wrong')
      .expect(401);
    await request(server.origin)
      .get('/api/review')
      .set('Authorization', `Bearer ${server.token}`)
      .set('Origin', 'https://evil.invalid')
      .expect(403);
    await request(server.origin)
      .get('/api/review')
      .set('Host', 'evil.invalid')
      .expect(403);
  });
  it('requires authentication for case-insensitive API routes', async () => {
    await request(server.origin).get('/API/REVIEW').expect(401);
    await request(server.origin).post('/Api/Review/Refresh').expect(401);
    await request(server.origin).get('/API/review/diff').expect(401);
  });
  it('returns captured content, invalidates old diffs and never exposes arbitrary paths', async () => {
    const auth = `Bearer ${server.token}`;
    const response = await request(server.origin)
      .get('/api/review')
      .set('Authorization', auth)
      .expect(200);
    const id = (response.body as { id: string }).id;
    const diff = await request(server.origin)
      .get('/api/review/diff')
      .query({ id, path: 'a.ts' })
      .set('Authorization', auth)
      .expect(200);
    expect((diff.body as { after: string }).after).toContain('a = 2');
    await request(server.origin)
      .get('/api/review/diff')
      .query({ id, path: '../outside' })
      .set('Authorization', auth)
      .expect(404);
    await fs.writeFile(path.join(root, 'a.ts'), 'export const a = 3;');
    await request(server.origin)
      .post('/api/review/refresh')
      .set('Origin', server.origin)
      .set('Authorization', auth)
      .expect(201);
    await request(server.origin)
      .get('/api/review/diff')
      .query({ id, path: 'a.ts' })
      .set('Authorization', auth)
      .expect(409);
  });
  it('cleans up when startup capture fails', async () => {
    await expect(
      startReviewServer({ root, base: 'absent', assets: root }),
    ).rejects.toThrow('not found');
  });
});
