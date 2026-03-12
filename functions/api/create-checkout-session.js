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

const getFileExtension = (file) => {
  const fileName = typeof file?.name === "string" ? file.name.trim() : "";
  const match = fileName.match(/\.([a-zA-Z0-9]+)$/);

  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  const mimeMap = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  return mimeMap[file?.type] || "bin";
};

const buildTempKey = (suffix, extension) => {
  const timestamp = Date.now();
  const randomBytes = crypto.getRandomValues(new Uint8Array(8));
  const randomPart = Array.from(randomBytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return `temp/clubes/${timestamp}-${randomPart}-${suffix}.${extension}`;
};

const assertImageFile = (file, fieldName) => {
  if (!(file instanceof File) || !file.name || file.size <= 0) {
    throw new Error(`El archivo ${fieldName} es obligatorio.`);
  }
};

const uploadTempImage = async (bucket, file, suffix) => {
  const extension = getFileExtension(file);
  const key = buildTempKey(suffix, extension);
  const body = await file.arrayBuffer();

  await bucket.put(key, body, {
    httpMetadata: {
      contentType: file.type || "application/octet-stream",
    },
    customMetadata: {
      originalName: file.name,
      uploadPhase: "checkout_pending",
    },
  });

  return key;
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

  if (!env?.DB) {
    return json({ ok: false, error: "DB binding no configurado." }, { status: 500 });
  }

  if (!env?.TEMP_IMAGES) {
    return json(
      { ok: false, error: "TEMP_IMAGES binding no configurado." },
      { status: 500 }
    );
  }

  if (!env?.STRIPE_SECRET_KEY) {
    return json(
      { ok: false, error: "STRIPE_SECRET_KEY no configurado." },
      { status: 500 }
    );
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return json(
        { ok: false, error: "Content-Type invalido. Usa multipart/form-data." },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const logoFile = formData.get("logo");
    const groupFile = formData.get("foto_grupal");

    assertImageFile(logoFile, "logo");
    assertImageFile(groupFile, "foto_grupal");

    const club = {
      nombre_club: normalizeField(formData.get("nombre_club"), { required: true }),
      direccion: normalizeField(formData.get("direccion"), { required: true }),
      ciudad_estado: normalizeField(formData.get("ciudad_estado"), { required: true }),
      instructor: normalizeField(formData.get("instructor"), { required: true }),
      red_social: normalizeField(formData.get("red_social")),
    };

    const [tempLogoKey, tempGroupKey] = await Promise.all([
      uploadTempImage(env.TEMP_IMAGES, logoFile, "logo"),
      uploadTempImage(env.TEMP_IMAGES, groupFile, "grupo"),
    ]);

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
        temp_logo_key,
        temp_group_key
      )
      VALUES(?, ?, ?, ?, ?, 'INACTIVO', 'pending', 0, ?, ?)`
    )
      .bind(
        club.nombre_club,
        club.direccion,
        club.ciudad_estado,
        club.instructor,
        club.red_social,
        tempLogoKey,
        tempGroupKey
      )
      .run();

    const clubId = insertResult?.meta?.last_row_id;
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
    const status =
      error instanceof TypeError || error.message === "Campos requeridos incompletos."
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
