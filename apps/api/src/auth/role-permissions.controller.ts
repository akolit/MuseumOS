import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Put,
} from '@nestjs/common';
import { RolePermissionsService } from './role-permissions.service';
import { RequirePermission } from './decorators/require-permission.decorator';
import {
  PERMISSIONS_BY_RESOURCE,
  ALL_PERMISSIONS,
} from './permissions';
import type { Role } from '@prisma/client';

@Controller('role-permissions')
export class RolePermissionsController {
  constructor(
    @Inject(RolePermissionsService)
    private readonly rolePerms: RolePermissionsService,
  ) {}

  // Returns: the matrix + the permission inventory (so the UI can render
  // a stable column ordering without hardcoding it).
  @Get()
  @RequirePermission('settings:write')
  async get() {
    return {
      matrix: await this.rolePerms.getMatrix(),
      resources: PERMISSIONS_BY_RESOURCE,
      allPermissions: ALL_PERMISSIONS,
    };
  }

  // Body: { matrix: Record<Role, Record<Permission, boolean>> }
  // Admin row in the body is silently ignored — admin is implicit.
  @Put()
  @RequirePermission('settings:write')
  async update(@Body() body: unknown) {
    if (!body || typeof body !== 'object' || !('matrix' in body)) {
      throw new BadRequestException('Body must include `matrix`');
    }
    const matrix = (body as { matrix: unknown }).matrix;
    if (!matrix || typeof matrix !== 'object') {
      throw new BadRequestException('`matrix` must be an object');
    }
    await this.rolePerms.updateMatrix(
      matrix as Record<Role, Record<string, boolean>>,
    );
    return { ok: true };
  }
}
