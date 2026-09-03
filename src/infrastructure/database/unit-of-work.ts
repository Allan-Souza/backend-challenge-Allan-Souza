import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';

export interface IUnitOfWork {
  execute<T>(work: () => Promise<T>): Promise<T>;
}

@Injectable()
export class MikroOrmUnitOfWork implements IUnitOfWork {
  constructor(private readonly em: EntityManager) {}

  async execute<T>(work: () => Promise<T>): Promise<T> {
    return await this.em.transactional(async () => {
      return await work();
    });
  }
}
