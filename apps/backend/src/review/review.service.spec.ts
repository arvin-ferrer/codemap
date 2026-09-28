import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import { ReviewService } from './review.service';
jest.mock('node:worker_threads', () => ({ Worker: jest.fn() }));
describe('ReviewService', () => {
  let worker: EventEmitter & { terminate: jest.Mock; postMessage: jest.Mock };
  let service: ReviewService;
  beforeEach(() => {
    worker = Object.assign(new EventEmitter(), {
      terminate: jest.fn().mockResolvedValue(0),
      postMessage: jest.fn(),
    });
    (Worker as unknown as jest.Mock).mockImplementation(() => worker);
    service = new ReviewService({ root: '/repo', base: 'main' });
  });
  it('coalesces captures and caches completed results', async () => {
    const first = service.current();
    const second = service.refresh();
    expect(first).toBe(second);
    const result = { data: { id: 'one' }, diffs: {} };
    worker.emit('message', { review: result });
    expect(await first).toEqual(result);
    expect(await service.current()).toEqual(result);
    expect(worker.terminate).toHaveBeenCalled();
  });
  it('keeps the previous snapshot after a failed refresh', async () => {
    const first = service.current();
    worker.emit('message', { review: { data: { id: 'one' }, diffs: {} } });
    await first;
    const refresh = service.refresh();
    worker.emit('message', { error: 'capture failed' });
    await expect(refresh).rejects.toThrow('capture failed');
    expect((await service.current()).data.id).toBe('one');
  });
  it('handles worker failure and premature exit', async () => {
    const first = service.current();
    worker.emit('error', new Error('hidden'));
    await expect(first).rejects.toThrow('worker failed');
    const next = service.current();
    worker.emit('exit', 1);
    await expect(next).rejects.toThrow('stopped');
  });
  it('terminates timed-out and closed workers', async () => {
    jest.useFakeTimers();
    const pending = service.current();
    const assertion = expect(pending).rejects.toThrow('time budget');
    jest.advanceTimersByTime(60200);
    await assertion;
    expect(worker.terminate).toHaveBeenCalled();
    await service.onModuleDestroy();
    await expect(service.refresh()).rejects.toThrow('closed');
    jest.useRealTimers();
  });
  it('cancels active Git work before shutting down the worker', async () => {
    jest.useFakeTimers();
    const pending = service.current();
    const rejected = expect(pending).rejects.toThrow('stopped');
    const closing = service.onModuleDestroy();
    expect(worker.postMessage).toHaveBeenCalledWith('CANCEL');
    worker.emit('message', { cancelled: true });
    await closing;
    worker.emit('exit', 1);
    await rejected;
    jest.useRealTimers();
  });
});
