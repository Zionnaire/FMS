import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AccessChangeController } from './access-change.controller';
import { AccessChangeService } from './access-change.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    // Registered with the ACCESS-token secret as the module default, since that's what
    // JwtAuthGuard verifies against on every request with no override. AuthService overrides
    // `secret` explicitly on every refresh-token sign/verify call — refresh tokens never use
    // this default.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_ACCESS_TTL', '15m') },
      }),
    }),
  ],
  controllers: [AuthController, UsersController, TeamsController, AccessChangeController],
  providers: [AuthService, UsersService, TeamsService, AccessChangeService],
  // JwtModule is exported (not just imported) because JwtAuthGuard is registered globally via
  // APP_GUARD in AppModule — Nest instantiates it in AppModule's own injector context, which
  // can only see JwtService if the module that configures it re-exports it, not just imports
  // it privately. Caught live: `nest start` fails at boot with "Nest can't resolve dependencies
  // of JwtAuthGuard (?, Reflector)" without this export — static analysis (tsc/prisma
  // validate/build/lint) never runs Nest's actual DI container, so this was invisible until the
  // app was booted for the first time.
  exports: [AuthService, UsersService, TeamsService, JwtModule],
})
export class IdentityModule {}
