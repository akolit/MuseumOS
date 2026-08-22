import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SessionSerializer } from './session.serializer';
import { RolePermissionsService } from './role-permissions.service';
import { RolePermissionsController } from './role-permissions.controller';

@Module({
  providers: [AuthService, SessionSerializer, RolePermissionsService],
  controllers: [AuthController, RolePermissionsController],
  exports: [AuthService, RolePermissionsService],
})
export class AuthModule {}
