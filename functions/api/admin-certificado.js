import {
  json,
  requireAdminSession,
} from "./_admin-auth.js";

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
      payment_status,
      paid_at,
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

  if (record.payment_status !== "paid" || !record.paid_at) {
    return json(
      { ok: false, error: "El certificado aun no esta disponible para este club." },
      { status: 409 }
    );
  }

  return json({
    ok: true,
    data: {
      id: record.id,
      nombre_club: record.nombre_club,
      ciudad_estado: record.ciudad_estado,
      instructor: record.instructor,
      paid_at: record.paid_at,
      document_id: record.document_id || "",
    },
  });
}
