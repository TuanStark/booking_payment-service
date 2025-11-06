import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../messaging/redis/redis.service';

@Injectable()
export class ExternalService {
  private readonly logger = new Logger(ExternalService.name);
  private readonly authServiceUrl: string;
  private readonly cacheTTL = 3600; // 1 hour

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.authServiceUrl =
      this.configService.get<string>('AUTH_SERVICE_URL') ||
      'http://localhost:3001';
  }

  /**
   * Lấy nhiều users theo IDs với caching và parallel requests
   */
  async getUsersByIds(
    userIds: string[],
    token?: string,
  ): Promise<Map<string, any>> {
    // Deduplicate và loại bỏ null/undefined
    const uniqueIds = [...new Set(userIds.filter((id) => id))];
    if (uniqueIds.length === 0) {
      return new Map();
    }

    const result = new Map<string, any>();
    const idsToFetch: string[] = [];

    // Check cache trước
    await Promise.all(
      uniqueIds.map(async (id) => {
        const cacheKey = `user:${id}`;
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
          result.set(id, cached);
        } else {
          idsToFetch.push(id);
        }
      }),
    );

    // Nếu đã có đủ từ cache, return luôn
    if (idsToFetch.length === 0) {
      return result;
    }

    // Fetch từ service (parallel requests)
    try {
      const fetchPromises = idsToFetch.map((id) =>
        this.fetchUserById(id, token).catch((error) => {
          this.logger.warn(`Failed to fetch user ${id}: ${error.message}`);
          return null;
        }),
      );

      const users = await Promise.all(fetchPromises);

      // Cache và add vào result
      await Promise.all(
        users.map(async (user, index) => {
          if (user) {
            const id = idsToFetch[index];
            result.set(id, user);
            await this.redisService.set(
              `user:${id}`,
              user,
              this.cacheTTL,
            );
          }
        }),
      );
    } catch (error) {
      this.logger.error(
        `Error fetching users: ${error.message}`,
        error.stack,
      );
    }

    return result;
  }

  /**
   * Lấy một user theo ID
   */
  private async fetchUserById(userId: string, token?: string): Promise<any> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      // Build headers với token nếu có
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = token.startsWith('Bearer ')
          ? token
          : `Bearer ${token}`;
      }

      const response = await fetch(
        `${this.authServiceUrl}/user/${userId}`,
        {
          signal: controller.signal,
          headers,
        },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          this.logger.warn(`User not found: ${userId}`);
          return null;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // ResponseData wrapper: { data, status, message }
      if (data && data.data) {
        return data.data;
      }
      return data;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        this.logger.error(`Request timeout for user ${userId}`);
        throw new Error(`Request timeout for user ${userId}`);
      }
      if (error.message?.includes('404')) {
        this.logger.warn(`User not found: ${userId}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Invalidate cache cho user
   */
  async invalidateUserCache(userId: string): Promise<void> {
    await this.redisService.del(`user:${userId}`);
  }
}

