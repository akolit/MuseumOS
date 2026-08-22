import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { DatabaseService } from '../database';
import type { Role } from '@prisma/client';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  themePreference: string | null;
  langPreference: string | null;
  // Snapshot of permissions taken at login and rehydrated per request from
  // the session. Changes to the matrix take effect on next login.
  permissions: string[];
}

@Injectable()
export class AuthService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async validateUser(identifier: string, password: string): Promise<SessionUser> {
    const trimmed = identifier.trim();

    // Look up by email OR displayName. take:2 lets us detect duplicate
    // displayNames (which the schema does not enforce uniqueness on) and
    // reject ambiguous logins rather than logging in as the wrong user.
    const matches = await this.db.user.findMany({
      where: {
        OR: [
          { email: trimmed.toLowerCase() },
          { displayName: { equals: trimmed, mode: 'insensitive' } },
        ],
      },
      take: 2,
    });

    if (matches.length === 0 || matches.length > 1) {
      // Same error message for "no match" and "ambiguous match" — both
      // surface as "Invalid credentials" client-side. Avoids leaking
      // displayName collisions to anyone probing the login form.
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = matches[0]!;
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      themePreference: user.themePreference,
      langPreference: user.langPreference,
      // Populated by AuthGuard from req.session at request time. The empty
      // default lets us construct a SessionUser before the session is read.
      permissions: [],
    };
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  async getUserById(id: string): Promise<SessionUser | null> {
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      themePreference: user.themePreference,
      langPreference: user.langPreference,
      // Populated by AuthGuard from req.session at request time. The empty
      // default lets us construct a SessionUser before the session is read.
      permissions: [],
    };
  }
}
