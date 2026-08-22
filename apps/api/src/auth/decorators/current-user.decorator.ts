import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { SessionUser } from '../auth.service';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser | null => {
    const request = ctx.switchToHttp().getRequest();
    return request.user ?? null;
  },
);
