import { Controller, Get } from '@nestjs/common'
import { Public } from '../auth/permissions.guard'

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { status: string; service: string } {
    return { status: 'ok', service: 'prodx-api' }
  }
}
