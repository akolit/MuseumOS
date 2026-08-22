import 'reflect-metadata';
import path from 'path';
import { randomBytes } from 'crypto';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { AppModule } from './app.module';

// A signing secret is the only thing standing between a forged cookie and a
// valid admin session. Never fall back to a default in production — refuse to
// boot instead, so a missing env var fails loudly at deploy time rather than
// silently accepting attacker-signed sessions.
function requireSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET must be set to at least 32 characters in production. ' +
        'Generate one with `openssl rand -hex 64`.',
    );
  }

  Logger.warn(
    'SESSION_SECRET is unset or too short — using an ephemeral development ' +
      'secret. Sessions will not survive a restart.',
    'Bootstrap',
  );
  return randomBytes(32).toString('hex');
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Without this, Express ignores X-Forwarded-For, so `req.ip` is the proxy's
  // container address for every request — keying the rate limiter to a single
  // shared bucket and recording a useless IP on every audit-log entry.
  //
  // The count must match the number of proxies that actually append to
  // X-Forwarded-For, exactly. The default of 2 matches this repo's compose:
  //   client → Traefik (sets XFF) → nginx (appends) → api
  // Too low and req.ip is the innermost proxy (the bug above). Too high and a
  // client can spoof its own address by sending an X-Forwarded-For header.
  // Set TRUST_PROXY_HOPS to 1 if you expose the API behind a single proxy,
  // or 0 if nothing fronts it.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 2));

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());

  // Serve images from the repo's img directory.
  // NOTE: thumbs are NOT marked immutable — a thumbnail at the same storage_key
  // can be regenerated (e.g. EXIF rotation fix, encoder upgrade), and an
  // immutable header would pin stale content in the browser for a year.
  const imagesDir = path.resolve(__dirname, '../../../img');
  app.use('/img/thumbs', express.static(path.join(imagesDir, 'thumbs'), { maxAge: '7d' }));
  app.use('/img', express.static(imagesDir, { maxAge: '1d' }));

  const sessionSecret = requireSessionSecret();
  const PgStore = connectPgSimple(session);

  app.use(
    session({
      store: new PgStore({
        conString: process.env.DATABASE_URL,
        tableName: 'http_sessions',
        createTableIfMissing: true,
      }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      name: 'museumos.sid',
      cookie: {
        httpOnly: true,
        // Defaults to true in production; set SESSION_COOKIE_SECURE=false to
        // allow plain-HTTP or self-signed-TLS deploys (Chrome silently drops
        // Secure cookies when the certificate is untrusted, which makes an
        // initial rollout behind a not-yet-valid cert impossible to debug).
        secure: process.env.SESSION_COOKIE_SECURE !== 'false'
          && process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  const port = process.env.API_PORT ?? 3000;
  await app.listen(port);

  Logger.log(
    `MuseumOS API running on http://localhost:${port}/api`,
    'Bootstrap',
  );
}

bootstrap();
