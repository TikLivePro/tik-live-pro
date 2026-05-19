import { z } from 'zod';

export { z };

export const emailSchema = z.string().email().max(254).toLowerCase().trim();
export const passwordSchema = z.string().min(8).max(128);
export const uuidSchema = z.string().uuid();
export const displayNameSchema = z.string().min(1).max(100).trim();
export const urlSchema = z.string().url().max(2048);
export const localeSchema = z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).default('en');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export function validateOrThrow<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): z.infer<T> {
  return schema.parse(data);
}
