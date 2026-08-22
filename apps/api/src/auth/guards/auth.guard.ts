import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthService } from '../auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.session?.userId as string | undefined;

    if (!userId) {
      throw new UnauthorizedException();
    }

    const user = await this.authService.getUserById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    // Permissions live in the session as an immutable snapshot from login.
    // Default to [] for backward-compat with sessions created before this
    // feature shipped — those users won't pass PermissionGuard until they
    // hit /auth/me (which lazily tops up) or re-login.
    request.user = { ...user, permissions: request.session?.permissions ?? [] };
    return true;
  }
}
