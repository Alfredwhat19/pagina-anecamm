export const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=UTF-8",
      ...(init.headers || {}),
    },
    ...init,
  });

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
    `SELECT id, nombre_club, ciudad_estado, instructor, payment_status, paid_at
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

  return json(
    {
      ok: true,
      data: {
        id: record.id,
        nombre_club: record.nombre_club,
        ciudad_estado: record.ciudad_estado,
        instructor: record.instructor,
        paid_at: record.paid_at,
      },
    },
    { headers: { "cache-control": "no-store" } }
  );
}
