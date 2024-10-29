import { UploadConfig } from '../../types/upload.types';

export const uploadConfig: UploadConfig = {
  maxFileSizes: {
    foods: 5, // MB
    menus: 10,
    categories: 2,
    users: 3,
  },
  allowedTypes: {
    foods: ['image/jpeg', 'image/png', 'image/webp'],
    menus: ['image/jpeg', 'image/png', 'application/pdf'],
    categories: ['image/jpeg', 'image/png'],
    users: ['image/jpeg', 'image/png', 'image/gif'],
  },
} as const;
