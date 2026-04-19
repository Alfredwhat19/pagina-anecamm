import {
  json,
  requireAdminSession,
} from "./_admin-auth.js";

class HttpError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

const normalizeField = (value, { required = false } = {}) => {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (required && !normalized) {
    throw new HttpError("Campos requeridos incompletos.", 400);
  }

  return normalized;
};

const parsePaidAt = (paidAt) => {
  if (!paidAt || typeof paidAt !== "string") return null;
  const normalized = paidAt.includes("T") ? paidAt : paidAt.replace(" ", "T");
  const hasTimezone = /Z|[+-]\d{2}:?\d{2}$/.test(normalized);
  const withTimezone = hasTimezone ? normalized : `${normalized}Z`;
  const parsed = new Date(withTimezone);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildDocumentId = (clubId, createdAt) => {
  const datePart = createdAt.toISOString().slice(0, 10).replace(/-/g, "");
  return `ANECAMM-${clubId}-${datePart}`;
};

export async function onRequestPost({ env, request }) {
  if (!env?.DB) {
    return json({ ok: false, error: "DB binding no configurado." }, { status: 500 });
  }

  const auth = await requireAdminSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Payload JSON invalido." }, { status: 400 });
  }

  try {
    const club = {
      nombre_club: normalizeField(payload?.nombre_club, { required: true }),
      direccion: normalizeField(payload?.direccion, { required: true }),
      ciudad_estado: normalizeField(payload?.ciudad_estado, { required: true }),
      instructor: normalizeField(payload?.instructor, { required: true }),
      red_social: normalizeField(payload?.red_social),
    };

    const insertResult = await env.DB.prepare(
      `INSERT INTO directorio_clubes(
        nombre_club,
        direccion,
        ciudad_estado,
        instructor,
        red_social,
        estatus,
        payment_status,
        visible_in_directory,
        paid_at
      )
      VALUES(?, ?, ?, ?, ?, 'ACTIVO', 'paid', 1, CURRENT_TIMESTAMP)`
    )
      .bind(
        club.nombre_club,
        club.direccion,
        club.ciudad_estado,
        club.instructor,
        club.red_social
      )
      .run();

    const clubId = insertResult?.meta?.last_row_id;
    if (!clubId) {
      throw new Error("No se pudo guardar el registro manual.");
    }

    const savedRecord = await env.DB.prepare(
      `SELECT
        id,
        nombre_club,
        ciudad_estado,
        instructor,
        red_social,
        paid_at,
        document_id
      FROM directorio_clubes
      WHERE id = ?
      LIMIT 1`
    )
      .bind(clubId)
      .first();

    if (!savedRecord) {
      throw new Error("No se pudo recargar el registro manual.");
    }

    let documentId = savedRecord.document_id || "";
    if (!documentId) {
      const createdAt = parsePaidAt(savedRecord.paid_at);
      if (!createdAt) {
        throw new Error("No se pudo interpretar la fecha del registro manual.");
      }

      documentId = buildDocumentId(savedRecord.id, createdAt);
      await env.DB.prepare(
        `UPDATE directorio_clubes
         SET document_id = ?
         WHERE id = ?`
      )
        .bind(documentId, savedRecord.id)
        .run();
    }

    return json({
      ok: true,
      data: {
        id: savedRecord.id,
        nombre_club: savedRecord.nombre_club,
        ciudad_estado: savedRecord.ciudad_estado,
        instructor: savedRecord.instructor,
        red_social: savedRecord.red_social,
        paid_at: savedRecord.paid_at,
        document_id: documentId,
        estatus: "ACTIVO",
      },
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return json(
      {
        ok: false,
        error: error?.message || "No se pudo guardar el registro manual.",
      },
      { status }
    );
  }
}
