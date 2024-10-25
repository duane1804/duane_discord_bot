import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity({ name: 'foot_category' })
export class FoodCategory extends BaseEntity {
  constructor(partial?: Partial<FoodCategory>) {
    super();
    Object.assign(this, partial);
  }

  @Column({ nullable: false, type: 'varchar' })
  name: string;
}

@Entity({ name: 'food' })
export class Food extends BaseEntity {
  constructor(partial?: Partial<Food>) {
    super();
    Object.assign(this, partial);
  }

  @Column({ nullable: false, type: 'varchar' })
  name: string;

  @Column({ nullable: true, type: 'varchar' })
  image: string;

  @ManyToOne(() => FoodCategory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: FoodCategory;
}
