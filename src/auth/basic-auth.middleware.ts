import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BasicAuthMiddleware implements NestMiddleware {
  constructor(private configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.setHeader('WWW-Authenticate', 'Basic');
      return res.status(401).send('Authentication required.');
    }

    const auth = Buffer.from(authHeader.split(' ')[1], 'base64')
      .toString()
      .split(':');
    const user = auth[0];
    const pass = auth[1];

    if (
      user === this.configService.get('BULL_BOARD_USERNAME') &&
      pass === this.configService.get('BULL_BOARD_PASSWORD')
    ) {
      next();
    } else {
      res.setHeader('WWW-Authenticate', 'Basic');
      res.status(401).send('Authentication required.');
    }
  }
}
