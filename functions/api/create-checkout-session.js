const STRIPE_API_URL = "https://api.stripe.com/v1/checkout/sessions";
const SUCCESS_URL =
  "https://www.anecamm.com/frontend/html/afiliaciones.html?success=true";
const CANCEL_URL =
  "https://www.anecamm.com/frontend/html/afiliaciones.html?cancel=true";

const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=UTF-8",
      ...(init.headers || {}),
    },
    ...init,
  });

const normalizeField = (value, { required = false } = {}) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (required && !normalized) {
    throw new Error("Campos requeridos incompletos.");
  }
  return normalized;
};

const createStripeCheckoutSession = async (secretKey, club) => {
  const body = new URLSearchParams({
    mode: "payment",
    success_url: SUCCESS_URL,
    cancel_url: CANCEL_URL,
    "line_items[0][price_data][currency]": "mxn",
    "line_items[0][price_data][product_data][name]":
      `Afiliacion ANECAMM - ${club.nombre_club}`,
    "line_items[0][price_data][unit_amount]": "150000",
    "line_items[0][quantity]": "1",
    "metadata[nombre_club]": club.nombre_club,
  });

  const response = await fetch(STRIPE_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = await response.json();
  if (!response.ok || !payload?.url || !payload?.id) {
    throw new Error(payload?.error?.message || "No se pudo crear la sesion de pago.");
  }

  return payload;
};

export async function onRequestPost(context) {
  const { env, request } = context;
  let clubId = null;

  if (!env?.DB) {
    return json({ ok: false, error: "DB binding no configurado." }, { status: 500 });
  }

  if (!env?.STRIPE_SECRET_KEY) {
    return json(
      { ok: false, error: "STRIPE_SECRET_KEY no configurado." },
      { status: 500 }
    );
  }

  try {
    const data = await request.json();
    const club = {
      nombre_club: normalizeField(data?.nombre_club, { required: true }),
      direccion: normalizeField(data?.direccion, { required: true }),
      ciudad_estado: normalizeField(data?.ciudad_estado, { required: true }),
      instructor: normalizeField(data?.instructor, { required: true }),
      red_social: normalizeField(data?.red_social),
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
        visible_in_directory
      )
      VALUES(?, ?, ?, ?, ?, 'INACTIVO', 'pending', 0)`
    )
      .bind(
        club.nombre_club,
        club.direccion,
        club.ciudad_estado,
        club.instructor,
        club.red_social
      )
      .run();

    clubId = insertResult?.meta?.last_row_id;
    if (!clubId) {
      throw new Error("No se pudo registrar el club pendiente.");
    }

    const session = await createStripeCheckoutSession(env.STRIPE_SECRET_KEY, club);

    await env.DB.prepare(
      `UPDATE directorio_clubes
      SET stripe_session_id = ?
      WHERE id = ?`
    )
      .bind(session.id, clubId)
      .run();

    return json({
      ok: true,
      checkoutUrl: session.url,
      id: clubId,
    });
  } catch (error) {
    if (clubId) {
      try {
        await env.DB.prepare(
          `DELETE FROM directorio_clubes
           WHERE id = ? AND payment_status = 'pending'`
        )
          .bind(clubId)
          .run();
      } catch (cleanupError) {
        console.error("Error limpiando registro pendiente:", cleanupError);
      }
    }

    const status =
      error instanceof SyntaxError || error.message === "Campos requeridos incompletos."
        ? 400
        : 500;

    return json(
      {
        ok: false,
        error: error.message || "Error al crear la sesion de checkout.",
      },
      { status }
    );
  }
}