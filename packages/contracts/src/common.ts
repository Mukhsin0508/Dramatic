import { z } from "zod";

export const EntityIdSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a lowercase kebab-case identifier");

export const SlugSchema = EntityIdSchema;
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const AssetSchema = z.object({
  url: z.url(),
  width: z.int().positive().optional(),
  height: z.int().positive().optional(),
  blurhash: z.string().min(6).optional(),
});

export type Asset = z.infer<typeof AssetSchema>;
