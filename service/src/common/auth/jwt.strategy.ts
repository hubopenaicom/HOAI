import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
// import { RedisService } from './../../redis/redis.service';
import { RedisCacheService } from '@/modules/redisCache/redisCache.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly redisService: RedisCacheService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      /* getJwtSecret() 返回 Promise，不能直接作为 secretOrKey，否则校验会使用无效密钥 */
      secretOrKeyProvider: (_request, _rawJwtToken, done) => {
        redisService
          .getJwtSecret()
          .then(secret => done(null, secret))
          .catch(err => done(err, undefined));
      },
    });
  }

  /* fromat decode token return */
  async validate(payload): Promise<any> {
    return payload;
  }
}
