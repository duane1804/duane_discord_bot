export type ModuleType = 'foods' | 'menus' | 'categories' | 'users' | 'kiss';

export type AllowedMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'
  | 'application/pdf';

export interface UploadConfig {
  maxFileSizes: Record<ModuleType, number>;
  allowedTypes: Record<ModuleType, AllowedMimeType[]>;
}
