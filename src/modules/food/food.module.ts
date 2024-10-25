import { Module } from '@nestjs/common';
import { FoodService } from './food.service';
import { Food, FoodCategory } from './entities/food.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forFeature([FoodCategory]),
    TypeOrmModule.forFeature([Food]),
  ],
  providers: [FoodService],
})
export class FoodModule {}
