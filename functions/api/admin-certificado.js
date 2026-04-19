import {
  json,
  requireAdminSession,
} from "./_admin-auth.js";

const parseDate = (value) => {
  if (!value || typeof value !== "string") return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const hasTimezone = /Z|[+-]\d{2}:?\d{2}$/.test(normalized);
  const withTimezone = hasTimezone ? normalized : `${normalized}Z`;
  const parsed = new Date(withTimezone);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildDocumentId = (clubId, createdAt) => {
  const datePart = createdAt.toISOString().slice(0, 10).replace(/-/g, "");
  return `ANECAMM-${clubId}-${datePart}`;
};

export async function onRequestGet({ env, request }) {
  if (!env?.DB) {
    return json({ ok: false, error: "DB binding no configurado." }, { status: 500 });
  }

  const auth = await requireAdminSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const clubId = Number.parseInt(url.searchParams.get("club_id"), 10);

  if (!Number.isInteger(clubId) || clubId <= 0) {
    return json({ ok: false, error: "club_id invalido." }, { status: 400 });
  }

  const record = await env.DB.prepare(
    `SELECT
      id,
      nombre_club,
      ciudad_estado,
      instructor,
      estatus,
      visible_in_directory,
      payment_status,
      paid_at,
      fecha_registro,
      document_id
     FROM directorio_clubes
     WHERE id = ?
     LIMIT 1`
  )
    .bind(clubId)
    .first();

  if (!record) {
    return json({ ok: false, error: "No se encontro el club." }, { status: 404 });
  }

  let effectivePaidAt = record.paid_at;
  const canRecoverLegacyRecord =
    (!record.payment_status || record.payment_status !== "paid" || !record.paid_at) &&
    (record.estatus === "ACTIVO" || Number(record.visible_in_directory) === 1) &&
    record.fecha_registro;

  if (canRecoverLegacyRecord) {
    effectivePaidAt = record.fecha_registro;

    await env.DB.prepare(
      `UPDATE directorio_clubes
       SET
         payment_status = 'paid',
         paid_at = COALESCE(paid_at, fecha_registro, CURRENT_TIMESTAMP),
         estatus = 'ACTIVO',
         visible_in_directory = 1
       WHERE id = ?`
    )
      .bind(record.id)
      .run();
  }

  if (record.payment_status !== "paid" && !canRecoverLegacyRecord) {
    return json(
      { ok: false, error: "El certificado aun no esta disponible para este club." },
      { status: 409 }
    );
  }

  if (!effectivePaidAt) {
    return json(
      { ok: false, error: "El certificado aun no esta disponible para este club." },
      { status: 409 }
    );
  }

  let documentId = record.document_id || "";
  if (!documentId) {
    const createdAt = parseDate(effectivePaidAt);
    if (!createdAt) {
      return json(
        { ok: false, error: "No se pudo interpretar la fecha del registro." },
        { status: 500 }
      );
    }

    documentId = buildDocumentId(record.id, createdAt);
    await env.DB.prepare(
      `UPDATE directorio_clubes
       SET document_id = ?
       WHERE id = ?`
    )
      .bind(documentId, record.id)
      .run();
  }

  return json({
    ok: true,
    data: {
      id: record.id,
      nombre_club: record.nombre_club,
      ciudad_estado: record.ciudad_estado,
      instructor: record.instructor,
      paid_at: effectivePaidAt,
      document_id: documentId,
    },
  });
}
