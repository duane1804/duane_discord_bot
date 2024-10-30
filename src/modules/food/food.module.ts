import { Module } from '@nestjs/common';
import { FoodService } from './food.service';
import { Food, FoodCategory } from './entities/food.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FoodCategoryService } from './services/category.service';
import { FoodsService } from './services/foods.service';
import { UploadModule } from '../../services/upload/upload.module';
import { FoodInfoService } from './services/foodinfo.service';
import { RandomService } from './services/random.service';

@Module({
  imports: [TypeOrmModule.forFeature([Food, FoodCategory]), UploadModule],
  providers: [FoodService, FoodCategoryService, FoodsService, FoodInfoService, RandomService],
  exports: [FoodService],
})
export class FoodModule {}
