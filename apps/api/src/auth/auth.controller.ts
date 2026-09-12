import { Body, Controller, HttpCode, Post, UsePipes } from '@nestjs/common'
import {
  loginRequestSchema,
  refreshRequestSchema,
  type LoginRequest,
  type RefreshRequest,
  type TokenPair,
} from '@prodx/contracts'
import { ZodValidationPipe } from '../common/zod-validation.pipe'
import { AuthService } from './auth.service'
import { Public } from './permissions.guard'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(loginRequestSchema))
  login(@Body() body: LoginRequest): Promise<TokenPair> {
    return this.auth.login(body)
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(refreshRequestSchema))
  refresh(@Body() body: RefreshRequest): Promise<TokenPair> {
    return this.auth.refresh(body.refreshToken)
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @UsePipes(new ZodValidationPipe(refreshRequestSchema))
  async logout(@Body() body: RefreshRequest): Promise<void> {
    // Always 204, whether or not the token existed. Reporting "unknown token"
    // would confirm which tokens are real.
    await this.auth.logout(body.refreshToken)
  }
}
