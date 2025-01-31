import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity({ name: 'bank' })
export class Bank extends BaseEntity{
  constructor(partial?: Partial<Bank>) {
    super();
    Object.assign(this, partial);
  }

  @Column({ nullable: false, type: 'varchar' })
  name: string;

  @Column({ nullable: true, type: 'varchar' })
  short_name: string;

  @Column({ name: 'guild_id', nullable: true, type: 'varchar' })
  guildId: string;

  @Column({ nullable: true, type: 'varchar' })
  userId: string;
}
