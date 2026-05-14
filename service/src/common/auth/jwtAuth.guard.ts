import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { RedisCacheService } from '@/modules/redisCache/redisCache.service';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ModuleRef } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { AuthService } from '../../modules/auth/auth.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private redisCacheService: RedisCacheService,
    private readonly moduleRef: ModuleRef,
    private readonly globalConfigService: GlobalConfigService,
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {
    super();
  }

  async canActivate(context) {
    if (!this.redisCacheService) {
      this.redisCacheService = this.moduleRef.get(RedisCacheService, {
        strict: false,
      });
    }
    const request = context.switchToHttp().getRequest();
    // TODO 域名检测
    const _domain = request.headers.host;
    const token = this.extractToken(request);
    request.user = await this.validateToken(token);
    await this.redisCacheService.checkTokenAuth(token, request);
    return true;
  }

  private extractToken(request) {
    if (!request.headers.authorization) {
      if (request.headers.fingerprint) {
        let id = request.headers.fingerprint;
        /* 超过mysql最大值进行截取 */
        if (id > 2147483647) {
          id = id.toString().slice(-9);
          id = Number(String(Number(id)));
        }
        const token = this.authService.createTokenFromFingerprint(id);
        return token;
      }
      return null;
    }
    const parts = request.headers.authorization.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }
    return parts[1];
  }

  private async validateToken(token: string | null) {
    if (!token) {
      throw new HttpException(
        '亲爱的用户,请登录后继续操作,我们正在等您的到来！',
        HttpStatus.UNAUTHORIZED,
      );
    }
    try {
      /**
       * 必须与签发 token 时使用同一套密钥（JwtModule.registerAsync 在启动时注入的 secret）。
       * 若此处每次从 Redis 读取 JWT_SECRET 校验，而 Redis 中的值与进程启动时已缓存的 secret 不一致
       * （多实例覆盖、运维改密钥、竞态等），会出现「登录成功但随后所有请求 401」的现象。
       */
      return await this.jwtService.verifyAsync(token);
    } catch (error) {
      Logger.debug(`用户信息校验失败: ${(error as Error)?.message ?? error}`, 'JwtAuthGuard');
      throw new HttpException(
        '亲爱的用户,请登录后继续操作,我们正在等您的到来！',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  handleRequest(err, user, info) {
    if (err || !user) {
      console.log('err: ', err);
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
