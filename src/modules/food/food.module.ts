import { Module } from '@nestjs/common';
import { FoodService } from './food.service';
import { Food, FoodCategory } from './entities/food.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FoodCategoryService } from './services/category.service';

@Module({
  imports: [TypeOrmModule.forFeature([Food, FoodCategory])],
  providers: [FoodService, FoodCategoryService],
  exports: [FoodService],
})
export class FoodModule {}
