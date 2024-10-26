import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity({ name: 'food_category' })
export class FoodCategory extends BaseEntity {
  constructor(partial?: Partial<FoodCategory>) {
    super();
    Object.assign(this, partial);
  }

  @Column({ nullable: false, type: 'varchar', unique: true }) // Added unique constraint
  name: string;

  @Column({ nullable: true, type: 'varchar' })
  description: string;

  @OneToMany(() => Food, (food) => food.category)
  foods: Food[];
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

  @Column({ name: 'category_id' })
  categoryId: string;

  @ManyToOne(() => FoodCategory, (category) => category.foods, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'category_id' })
  category: FoodCategory;
}
