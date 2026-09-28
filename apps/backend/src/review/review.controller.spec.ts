import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

describe('ReviewController', () => {
  const captured = {
    data: { id: 'one' },
    diffs: {
      'a.ts': { reviewId: 'one', path: 'a.ts', before: 'old', after: 'new' },
    },
  };
  let service: { current: jest.Mock; refresh: jest.Mock };
  let controller: ReviewController;
  beforeEach(() => {
    service = {
      current: jest.fn().mockResolvedValue(captured),
      refresh: jest.fn().mockResolvedValue(captured),
    };
    controller = new ReviewController(service as unknown as ReviewService);
  });
  it('returns snapshots and refresh results', async () => {
    expect(await controller.get()).toEqual(captured.data);
    expect(await controller.refresh()).toEqual(captured.data);
  });
  it('only returns captured diffs for the requested snapshot', async () => {
    expect(await controller.diff('one', 'a.ts')).toEqual(
      captured.diffs['a.ts'],
    );
    await expect(controller.diff('old', 'a.ts')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(controller.diff('one', '../outside')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.diff('one', '__proto__')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  it('reports capture errors', async () => {
    service.current.mockRejectedValue(new Error('No baseline'));
    service.refresh.mockRejectedValue('failure');
    await expect(controller.get()).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.refresh()).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
