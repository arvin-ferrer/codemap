import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { ReviewOptions } from '@codemap/core';
import { ReviewService, REVIEW_OPTIONS } from './review.service';
import { ReviewController } from './review.controller';

export interface ServerOptions extends ReviewOptions {
  assets: string;
  token?: string;
}
export async function startReviewServer(options: ServerOptions) {
  const token = options.token ?? randomBytes(32).toString('hex');
  @Module({
    controllers: [ReviewController],
    providers: [ReviewService, { provide: REVIEW_OPTIONS, useValue: options }],
  })
  class ReviewModule {}
  const app = await NestFactory.create<NestExpressApplication>(ReviewModule, {
    logger: false,
  });
  let origin = '';
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    if (origin && req.headers.host !== new URL(origin).host) {
      res.status(403).end();
      return;
    }
    if (req.headers.origin && req.headers.origin !== origin) {
      res.status(403).end();
      return;
    }
    // Express routes are case-insensitive by default; the auth boundary must match.
    if (req.path.toLowerCase().startsWith('/api/')) {
      const supplied = req.headers.authorization;
      const value =
        typeof supplied === 'string' ? supplied.replace(/^Bearer /, '') : '';
      const actual = Buffer.from(value);
      const expected = Buffer.from(token);
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      ) {
        res.status(401).json({
          message: 'Open the authenticated URL from your CLI session.',
        });
        return;
      }
    }
    next();
  });
  app.useStaticAssets(options.assets, {
    index: 'index.html',
    dotfiles: 'deny',
  });
  try {
    // Fail before advertising a URL if the repository cannot be reviewed.
    await app.get(ReviewService).current();
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
    return {
      app,
      origin,
      token,
      url: `${origin}/#token=${token}`,
      close: () => app.close(),
    };
  } catch (error) {
    await app.close();
    throw error;
  }
}
