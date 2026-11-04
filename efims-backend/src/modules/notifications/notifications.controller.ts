import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { NotificationsService } from './notifications.service';

/** No `@Roles()` gate anywhere here — a notification only ever belongs to the requesting user
 * (`NotificationsService` filters/checks by `userId: actor.sub` internally), so there's no
 * broader authorization question the way there is for e.g. `cases` or `audit-events`. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query() dto: ListNotificationsDto) {
    return this.notificationsService.list(actor, dto);
  }

  @Post(':id/read')
  markRead(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.markRead(actor, id);
  }
}
