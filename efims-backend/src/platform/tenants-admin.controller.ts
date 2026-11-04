import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PlatformAuthGuard } from './platform-auth.guard';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { TenantsAdminService } from './tenants-admin.service';

/** Every route here is `@Public()` (to bypass the globally-registered tenant `JwtAuthGuard`, which
 * only knows how to verify tenant-scoped tokens) and separately `@UseGuards(PlatformAuthGuard)` —
 * see that guard's own doc comment for why this is two explicit opt-ins, not one. */
@Controller('platform/tenants')
@Public()
@UseGuards(PlatformAuthGuard)
export class TenantsAdminController {
  constructor(private readonly tenantsAdminService: TenantsAdminService) {}

  @Get()
  list() {
    return this.tenantsAdminService.list();
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsAdminService.create(dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.tenantsAdminService.updateStatus(id, dto);
  }
}
