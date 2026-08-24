import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Schema completo de LabSystem.
 *
 * Referencias:
 * - ARCH §6 (Modelo de datos)
 * - ADR-04 (snapshots en resultados_examenes y presupuestos_examenes)
 * - ADR-05 (paciente_id XOR paciente_nombre_libre en presupuestos)
 * - ADR-06 (cédula normalizada V-12345678; índice by_cedula)
 */
export default defineSchema({
  // Tablas requeridas por Convex Auth (users, authSessions, authAccounts,
  // authRefreshTokens, authVerificationCodes, authRateLimits). Ver:
  // https://labs.convex.dev/auth/setup/schema
  ...authTables,

  // ─────────────────────────────────────────────────────────────────────────────
  // Configuración del laboratorio (singleton)
  // ─────────────────────────────────────────────────────────────────────────────
  laboratorio_config: defineTable({
    nombre: v.string(),
    direccion: v.string(),
    telefono: v.optional(v.string()),
    email: v.optional(v.string()),
    rif: v.optional(v.string()),
    logo_storage_id: v.optional(v.id("_storage")),
    firma_storage_id: v.optional(v.id("_storage")),
    sello_storage_id: v.optional(v.id("_storage")),
    pdf_pie_pagina: v.optional(v.string()),
    updated_at: v.number(),
    updated_by: v.id("usuarios"),
  }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Pacientes
  // ─────────────────────────────────────────────────────────────────────────────
  pacientes: defineTable({
    nombre: v.string(),
    apellido: v.string(),
    cedula: v.string(),
    fecha_nacimiento: v.number(),
    sexo: v.optional(v.union(v.literal("M"), v.literal("F"), v.literal("O"))),
    telefono: v.optional(v.string()),
    email: v.optional(v.string()),
    direccion: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_cedula", ["cedula"])
    .index("by_search_nombre", ["nombre", "apellido"])
    .index("by_created", ["created_at"]),

  // ─────────────────────────────────────────────────────────────────────────────
  // Catálogo: títulos / grupos de exámenes
  // ─────────────────────────────────────────────────────────────────────────────
  examenes_titulos: defineTable({
    nombre: v.string(),
    orden: v.number(),
    created_at: v.number(),
  }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Catálogo: exámenes individuales
  // ─────────────────────────────────────────────────────────────────────────────
  examenes: defineTable({
    titulo_id: v.id("examenes_titulos"),
    nombre: v.string(),
    precio_usd: v.number(),
    unidad: v.optional(v.string()),
    valores_referencia: v.optional(v.string()),
    activo: v.boolean(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_titulo", ["titulo_id", "nombre"])
    .index("by_nombre_search", ["nombre"]),

  // ─────────────────────────────────────────────────────────────────────────────
  // Paquetes de exámenes
  // ─────────────────────────────────────────────────────────────────────────────
  paquetes: defineTable({
    nombre: v.string(),
    descripcion: v.optional(v.string()),
    created_at: v.number(),
  }),

  paquetes_examenes: defineTable({
    paquete_id: v.id("paquetes"),
    examen_id: v.id("examenes"),
    orden: v.number(),
  }).index("by_paquete", ["paquete_id", "orden"]),

  // ─────────────────────────────────────────────────────────────────────────────
  // Resultados de laboratorio
  // ─────────────────────────────────────────────────────────────────────────────
  resultados: defineTable({
    paciente_id: v.id("pacientes"),
    fecha_muestra: v.number(),
    fecha_resultado: v.optional(v.number()),
    medico_solicitante: v.optional(v.string()),
    estado: v.union(v.literal("Pendiente"), v.literal("Completado")),
    observaciones: v.optional(v.string()),
    origen_presupuesto_id: v.optional(v.id("presupuestos")),
    created_at: v.number(),
    created_by: v.id("usuarios"),
  })
    .index("by_paciente", ["paciente_id", "created_at"])
    .index("by_fecha", ["fecha_muestra"])
    .index("by_estado", ["estado"]),

  // Detalle de resultado con snapshot de examen (ADR-04)
  resultados_examenes: defineTable({
    resultado_id: v.id("resultados"),
    examen_id: v.id("examenes"),
    nombre_snap: v.string(),
    precio_snap: v.number(),
    unidad_snap: v.optional(v.string()),
    valores_referencia_snap: v.optional(v.string()),
    valor: v.string(),
    observacion: v.optional(v.string()),
    orden: v.number(),
  }).index("by_resultado", ["resultado_id", "orden"]),

  // ─────────────────────────────────────────────────────────────────────────────
  // Presupuestos
  // ─────────────────────────────────────────────────────────────────────────────
  presupuestos: defineTable({
    paciente_id: v.optional(v.id("pacientes")),
    paciente_nombre_libre: v.optional(v.string()),
    descuento_pct: v.number(),
    ganancia_pct: v.number(),
    tasa_bs: v.number(),
    total_usd: v.number(),
    total_bs: v.number(),
    estado: v.union(
      v.literal("Borrador"),
      v.literal("Aprobado"),
      v.literal("Convertido"),
    ),
    resultado_id: v.optional(v.id("resultados")),
    created_at: v.number(),
    created_by: v.id("usuarios"),
  })
    .index("by_paciente", ["paciente_id", "created_at"])
    .index("by_estado", ["estado", "created_at"])
    .index("by_fecha", ["created_at"]),

  // Detalle de presupuesto con snapshot de examen (ADR-04)
  presupuestos_examenes: defineTable({
    presupuesto_id: v.id("presupuestos"),
    examen_id: v.id("examenes"),
    nombre_snap: v.string(),
    precio_snap: v.number(),
    orden: v.number(),
  }).index("by_presupuesto", ["presupuesto_id", "orden"]),

  // ─────────────────────────────────────────────────────────────────────────────
  // Usuarios / perfiles de dominio (Convex Auth maneja authAccounts/sessions)
  // ─────────────────────────────────────────────────────────────────────────────
  usuarios: defineTable({
    email: v.string(),
    nombre: v.string(),
    role: v.union(v.literal("admin"), v.literal("operador")),
    activo: v.boolean(),
    created_at: v.number(),
  }).index("by_email", ["email"]),

  // ─────────────────────────────────────────────────────────────────────────────
  // Tasa de cambio Bs/USD
  // ─────────────────────────────────────────────────────────────────────────────
  tasa_cambio_bcv: defineTable({
    tasa: v.number(),
    fecha: v.number(),
    fuente: v.union(
      v.literal("bcv"),
      v.literal("dolartoday"),
      v.literal("manual"),
    ),
    scraped_at: v.number(),
    motivo: v.optional(v.string()),
    created_by: v.optional(v.id("usuarios")),
  }).index("by_fecha", ["fecha", "scraped_at"]),

  // ─────────────────────────────────────────────────────────────────────────────
  // Audit log
  // ─────────────────────────────────────────────────────────────────────────────
  audit_log: defineTable({
    usuario_id: v.optional(v.id("usuarios")),
    accion: v.string(),
    entity_type: v.string(),
    entity_id: v.optional(v.string()),
    metadata: v.any(),
    created_at: v.number(),
  })
    .index("by_created", ["created_at"])
    .index("by_usuario", ["usuario_id", "created_at"]),

  // ─────────────────────────────────────────────────────────────────────────────
  // Mapa de migración WordPress → Convex (F1.migracion)
  // Nota: Convex reserva nombres de tabla que comiencen con "_"; usamos "migration_map".
  migration_map: defineTable({
    wp_table: v.string(),
    wp_id: v.number(),
    convex_id: v.string(),
    migrated_at: v.number(),
  }).index("by_wp", ["wp_table", "wp_id"]),
});
