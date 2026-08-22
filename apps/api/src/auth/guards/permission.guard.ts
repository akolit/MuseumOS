import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import type { SessionUser } from '../auth.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride<string | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as SessionUser | undefined;

    if (!user) {
      throw new ForbiddenException();
    }

    // Admin is implicitly all-powerful regardless of what the matrix says.
    // (The Roles & Permissions UI also locks the admin row, but we enforce
    // server-side too to make accidental DB edits non-load-bearing.)
    if (user.role === 'admin') return true;

    if (!user.permissions?.includes(requiredPermission)) {
      throw new ForbiddenException(`Missing permission: ${requiredPermission}`);
    }

    return true;
  }
}
