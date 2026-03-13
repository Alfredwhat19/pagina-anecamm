export const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=UTF-8",
      ...(init.headers || {}),
    },
    ...init,
  });

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

export async function onRequestGet(context) {
  const { env, request } = context;

  if (!env?.DB) {
    return json({ ok: false, error: "DB binding no configurado." }, { status: 500 });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");

  if (!sessionId) {
    return json({ ok: false, error: "session_id es requerido." }, { status: 400 });
  }

  const record = await env.DB.prepare(
    `SELECT id, nombre_club, ciudad_estado, instructor, payment_status, paid_at, document_id
     FROM directorio_clubes
     WHERE stripe_session_id = ?
     LIMIT 1`
  )
    .bind(sessionId)
    .first();

  if (!record) {
    return json({ ok: false, error: "No se encontro la afiliacion." }, { status: 404 });
  }

  if (record.payment_status !== "paid" || !record.paid_at) {
    return json(
      { ok: false, error: "Pago aun no confirmado." },
      { status: 409, headers: { "cache-control": "no-store" } }
    );
  }

  let documentId = record.document_id || "";
  if (!documentId) {
    const createdAt = parsePaidAt(record.paid_at);
    if (!createdAt) {
      return json(
        { ok: false, error: "No se pudo interpretar la fecha del pago." },
        { status: 500, headers: { "cache-control": "no-store" } }
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

  return json(
    {
      ok: true,
      data: {
        id: record.id,
        nombre_club: record.nombre_club,
        ciudad_estado: record.ciudad_estado,
        instructor: record.instructor,
        paid_at: record.paid_at,
        document_id: documentId,
      },
    },
    { headers: { "cache-control": "no-store" } }
  );
}
