import { Injectable, Logger } from '@nestjs/common';
import { mkdir } from 'fs/promises';
import * as fs from 'fs';
import { existsSync } from 'fs';
import { join } from 'path';
import * as https from 'https';
import { uploadConfig } from '../../common/config/upload/upload.config';
import { AllowedMimeType, ModuleType } from '../../common/types/upload.types';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly uploadDir: string;
  private readonly validModules: ModuleType[] = [
    'foods',
    'menus',
    'categories',
    'users',
  ];

  // MIME type mapping for common file extensions
  private readonly mimeTypeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
  } as const;

  constructor() {
    this.uploadDir = join(process.cwd(), 'uploads');

    if (!existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir);
    }

    this.validModules.forEach((module) => {
      const modulePath = join(this.uploadDir, module);
      if (!existsSync(modulePath)) {
        fs.mkdirSync(modulePath);
      }
    });
  }

  private getMimeTypeFromFile(filePath: string): string | null {
    const extension = this.getFileExtension(filePath).toLowerCase();
    return this.mimeTypeMap[extension] || null;
  }

  private getFileExtension(urlOrPath: string): string {
    // First try to get extension from the original filename
    const filenameMatch = urlOrPath.match(/\/([^/?]+)\.[^/?]+(?:\?|$)/);
    if (filenameMatch) {
      const extension = `.${filenameMatch[0].split('.').pop().split('?')[0]}`;
      return extension.toLowerCase();
    }

    // Fallback to simple extension matching
    const match = urlOrPath.match(/\.([^.]+)(?:\?.*)?$/);
    return match ? `.${match[1].toLowerCase()}` : '';
  }

  private isValidImageFile(extension: string): boolean {
    return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(
      extension.toLowerCase(),
    );
  }

  private isAllowedFile(filePath: string, moduleType: ModuleType): boolean {
    const extension = this.getFileExtension(filePath);
    const mimeType = this.getMimeTypeFromFile(filePath);

    if (!mimeType) return false;

    const allowedTypes = uploadConfig.allowedTypes[moduleType];
    return allowedTypes.includes(mimeType as AllowedMimeType);
  }

  private downloadFile(
    url: string,
    filePath: string,
    moduleType: ModuleType,
  ): Promise<void> {
    const maxSize = uploadConfig.maxFileSizes[moduleType] * 1024 * 1024;
    const extension = this.getFileExtension(url);

    // Pre-check the file extension
    if (!this.isValidImageFile(extension)) {
      return Promise.reject(new Error(`Invalid file type: ${extension}`));
    }

    return new Promise((resolve, reject) => {
      https
        .get(url, (response) => {
          const contentLength = parseInt(
            response.headers['content-length'] || '0',
            10,
          );
          if (contentLength > maxSize) {
            reject(
              new Error(
                `File too large. Maximum size: ${uploadConfig.maxFileSizes[moduleType]}MB`,
              ),
            );
            return;
          }

          const fileStream = fs.createWriteStream(filePath);
          response.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();

            // Validate file after download
            if (!this.isAllowedFile(filePath, moduleType)) {
              fs.unlink(filePath, () => {});
              reject(new Error(`Invalid file type: ${extension}`));
              return;
            }

            resolve();
          });

          fileStream.on('error', (error) => {
            fs.unlink(filePath, () => {});
            reject(error);
          });
        })
        .on('error', reject);
    });
  }

  async uploadFromDiscord(
    attachmentUrl: string,
    guildId: string,
    moduleType: ModuleType,
  ): Promise<string | null> {
    try {
      if (!this.validModules.includes(moduleType)) {
        throw new Error(`Invalid module type: ${moduleType}`);
      }

      const folderPath = join(this.uploadDir, moduleType, guildId);
      await this.ensureDirectoryExists(folderPath);

      const fileExtension = this.getFileExtension(attachmentUrl);

      if (!this.isValidImageFile(fileExtension)) {
        throw new Error(`Invalid file extension: ${fileExtension}`);
      }

      const fileName = `${Date.now() + Math.random()}${fileExtension}`;
      const filePath = join(folderPath, fileName);
      const relativePath = join(moduleType, guildId, fileName);

      await this.downloadFile(attachmentUrl, filePath, moduleType);

      return relativePath;
    } catch (error) {
      this.logger.error(
        `Error uploading file for module ${moduleType}:`,
        error,
      );
      return null;
    }
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }
  }

  getFullPath(relativePath: string): string {
    return join(process.cwd(), 'uploads', relativePath);
  }

  async deleteFile(relativePath: string): Promise<boolean> {
    try {
      const fullPath = this.getFullPath(relativePath);
      if (existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error('Error deleting file:', error);
      return false;
    }
  }
}
