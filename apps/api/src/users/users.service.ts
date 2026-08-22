import {
  Inject,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Role } from '@prisma/client';
import { DatabaseService } from '../database';
import { AuthService } from '../auth';

interface CreateUserInput {
  email: string;
  displayName: string;
  password: string;
  role: Role;
}

interface UpdateUserInput {
  displayName?: string;
  role?: Role;
  themePreference?: string | null;
  langPreference?: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  async create(input: CreateUserInput) {
    const existing = await this.db.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await this.authService.hashPassword(input.password);

    return this.db.user.create({
      data: {
        id: randomUUID(),
        email: input.email.toLowerCase().trim(),
        displayName: input.displayName,
        passwordHash,
        role: input.role,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
      },
    });
  }

  async findAll() {
    return this.db.user.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        langPreference: true,
        themePreference: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string) {
    const user = await this.db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        langPreference: true,
        themePreference: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, input: UpdateUserInput) {
    await this.findById(id);

    return this.db.user.update({
      where: { id },
      data: input,
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        langPreference: true,
        themePreference: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async resetPassword(id: string, newPassword: string) {
    await this.findById(id);
    const passwordHash = await this.authService.hashPassword(newPassword);

    return this.db.user.update({
      where: { id },
      data: { passwordHash },
      select: { id: true, email: true },
    });
  }
}
