import { classToPlain } from 'class-transformer';
import { BeforeInsert, CreateDateColumn, PrimaryColumn } from 'typeorm';
import { getNanoId } from '../utils/helper';

export abstract class BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 15, unique: true, nullable: false })
  id: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  public createdAt: Date;

  /*
   *****************************************
   *
   *
   */

  @BeforeInsert()
  beforeInsert() {
    this.id = getNanoId(15);
  }

  /*
   *****************************************
   *
   *
   */

  public toJSON(): any {
    return classToPlain(this);
  }
}
