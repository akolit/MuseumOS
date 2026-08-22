import { Injectable } from '@nestjs/common';

@Injectable()
export class SessionSerializer {
  serializeUser(userId: string): string {
    return userId;
  }

  deserializeUser(userId: string): string {
    return userId;
  }
}
