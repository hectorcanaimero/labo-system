import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, requireRole } from "./helpers/auth.js";
import type { Id } from "./_generated/dataModel";
import {
  ASSET_MIME_PREFIX,
  ASSET_MIME_INVALIDO,
  ASSET_NO_ENCONTRADO,
  ASSET_TAMANO_EXCEDIDO,
  MAX_ASSET_SIZE_BYTES,
  configUpdateSchema,
  type AssetType,
  type ConfigUpdateInput,
} from "@labo/lib/schemas/config";

/**
 * Retorna el único documento de configuración del laboratorio.
 *
 * Retorna `null` en el primer arranque, antes de que un Admin guarde
 * la configuración inicial.
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("laboratorio_config").unique();
  },
});

/**
 * Actualiza o crea la configuración del laboratorio (Admin only).
 *
 * Realiza upsert sobre el singleton `laboratorio_config`, valida los
 * campos con el schema Zod compartido y deja traza en `audit_log`.
 */
export const update = mutation({
  args: {
    nombre: v.string(),
    direccion: v.string(),
    telefono: v.optional(v.string()),
    email: v.optional(v.string()),
    rif: v.optional(v.string()),
    pdf_pie_pagina: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "admin");

    const parsed = configUpdateSchema.safeParse(args);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      throw new Error(firstIssue.message);
    }

    const data: ConfigUpdateInput = parsed.data;
    const now = Date.now();

    const existing = await ctx.db.query("laboratorio_config").unique();

    let docId: Id<"laboratorio_config">;
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...data,
        updated_at: now,
        updated_by: user._id,
      });
      docId = existing._id;
    } else {
      docId = await ctx.db.insert("laboratorio_config", {
        ...data,
        updated_at: now,
        updated_by: user._id,
      });
    }

    await ctx.db.insert("audit_log", {
      usuario_id: user._id,
      accion: "config.update",
      entity_type: "laboratorio_config",
      entity_id: docId,
      metadata: { input: data },
      created_at: now,
    });

    return await ctx.db.get(docId);
  },
});

/**
 * Nombre del campo de `laboratorio_config` para cada tipo de asset.
 */
const ASSET_FIELD_BY_TYPE: Record<
  AssetType,
  "logo_storage_id" | "firma_storage_id" | "sello_storage_id"
> = {
  logo: "logo_storage_id",
  firma: "firma_storage_id",
  sello: "sello_storage_id",
};

/**
 * Arma el patch con el campo de asset correspondiente al tipo.
 *
 * Evita el computed-key spread con una unión de claves, que TypeScript no
 * puede inferir de forma segura en `ctx.db.patch`.
 */
function assetFieldPatch(
  type: AssetType,
  storageId: Id<"_storage">
): {
  logo_storage_id?: Id<"_storage">;
  firma_storage_id?: Id<"_storage">;
  sello_storage_id?: Id<"_storage">;
} {
  switch (type) {
    case "logo":
      return { logo_storage_id: storageId };
    case "firma":
      return { firma_storage_id: storageId };
    case "sello":
      return { sello_storage_id: storageId };
  }
}

/**
 * Genera una URL de upload de Convex File Storage (Admin only).
 *
 * El cliente hace `fetch(url, { method: "POST", body: file })` y recibe
 * `{ storageId }` en la respuesta. La URL es de corta duración.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Asigna un asset (logo/firma/sello) a la configuración del laboratorio.
 *
 * Defense in depth: valida MIME y tamaño contra los metadatos reales del
 * archivo en la tabla de sistema `_storage`. Si ya existía un asset del
 * mismo tipo, borra el anterior de storage antes de sobrescribir.
 */
export const setAsset = mutation({
  args: {
    type: v.union(v.literal("logo"), v.literal("firma"), v.literal("sello")),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "admin");

    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) {
      throw new Error(ASSET_NO_ENCONTRADO);
    }

    const contentType = metadata.contentType ?? "";
    if (!contentType.startsWith(ASSET_MIME_PREFIX)) {
      await ctx.storage.delete(args.storageId);
      throw new Error(ASSET_MIME_INVALIDO);
    }

    if (metadata.size > MAX_ASSET_SIZE_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new Error(ASSET_TAMANO_EXCEDIDO);
    }

    const now = Date.now();
    const existing = await ctx.db.query("laboratorio_config").unique();

    const prevStorageId = existing
      ? existing[ASSET_FIELD_BY_TYPE[args.type]]
      : undefined;

    const patch = assetFieldPatch(args.type, args.storageId);

    let docId: Id<"laboratorio_config">;
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...patch,
        updated_at: now,
        updated_by: user._id,
      });
      docId = existing._id;
    } else {
      docId = await ctx.db.insert("laboratorio_config", {
        nombre: "",
        direccion: "",
        ...patch,
        updated_at: now,
        updated_by: user._id,
      });
    }

    if (prevStorageId && prevStorageId !== args.storageId) {
      await ctx.storage.delete(prevStorageId);
    }

    await ctx.db.insert("audit_log", {
      usuario_id: user._id,
      accion: "config.setAsset",
      entity_type: "laboratorio_config",
      entity_id: docId,
      metadata: { type: args.type, storageId: args.storageId },
      created_at: now,
    });

    return args.storageId;
  },
});

/**
 * Retorna la URL firmada de un asset (TTL ~1h) para preview o PDF.
 *
 * Accesible para cualquier usuario autenticado (operadores también generan
 * PDFs que incrustan logo/firma/sello). Retorna `null` si no hay asset.
 */
export const getAssetUrl = query({
  args: {
    type: v.union(v.literal("logo"), v.literal("firma"), v.literal("sello")),
  },
  handler: async (ctx, args) => {
    await getCurrentUser(ctx);

    const config = await ctx.db.query("laboratorio_config").unique();
    const storageId = config
      ? config[ASSET_FIELD_BY_TYPE[args.type]]
      : undefined;

    if (!storageId) {
      return null;
    }

    return await ctx.storage.getUrl(storageId);
  },
});
