import * as Joi from '@hapi/joi';
import { ConfigService } from '@nestjs/config';

export function validateEnvConfig(
  configService: ConfigService,
  schemaOrEnvVars: Joi.ObjectSchema | string[],
) {
  let schema: Joi.ObjectSchema;

  if (Array.isArray(schemaOrEnvVars)) {
    // Nếu đầu vào là một mảng tên biến môi trường, tạo schema từ nó
    const envSchema = schemaOrEnvVars.reduce(
      (acc, key) => {
        acc[key] = Joi.string().required();
        return acc;
      },
      {} as Record<string, Joi.StringSchema>,
    );

    schema = Joi.object(envSchema);
  } else {
    // Nếu đầu vào là một schema Joi, sử dụng nó trực tiếp
    schema = schemaOrEnvVars;
  }

  // Lấy giá trị từ configService dựa trên các khóa của schema
  const envConfig = Object.keys(schema.describe().keys).reduce(
    (config, key) => {
      config[key] = configService.get(key);
      return config;
    },
    {} as Record<string, string>,
  );

  // Thực hiện validate
  const { error } = schema.validate(envConfig);

  if (error) {
    throw new Error(`Config validation error: ${error.message}`);
  }
}
