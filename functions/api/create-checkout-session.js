const STRIPE_API_URL = "https://api.stripe.com/v1/checkout/sessions";
const SUCCESS_URL =
  "https://www.anecamm.com/frontend/html/afiliaciones.html?success=true&session_id={CHECKOUT_SESSION_ID}";
const CANCEL_URL =
  "https://www.anecamm.com/frontend/html/afiliaciones.html?cancel=true";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

class HttpError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

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
    throw new HttpError("Campos requeridos incompletos.", 400);
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
    throw new HttpError(`El archivo ${fieldName} es obligatorio.`, 400);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new HttpError(`El archivo ${fieldName} excede el tamano maximo permitido de 5 MB.`, 400);
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new HttpError(
      `El archivo ${fieldName} debe ser JPG, PNG o WEBP.`,
      400
    );
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

const deleteTempImage = async (bucket, key) => {
  if (!key) return;
  await bucket.delete(key);
};

const cleanupTempImages = async (bucket, keys) => {
  const cleanupTasks = keys.filter(Boolean).map((key) => deleteTempImage(bucket, key));
  const results = await Promise.allSettled(cleanupTasks);

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("Error limpiando imagen temporal:", result.reason);
    }
  });
};

const deletePendingClub = async (db, clubId) => {
  if (!clubId) return;

  try {
    await db.prepare(
      `DELETE FROM directorio_clubes
       WHERE id = ? AND payment_status = 'pending'`
    )
      .bind(clubId)
      .run();
  } catch (error) {
    console.error("Error eliminando registro pendiente:", error);
  }
};

const getChangedRows = (result) => Number(result?.meta?.changes || 0);

const createStripeCheckoutSession = async (secretKey, club) => {
  const body = new URLSearchParams({
    mode: "subscription",
    success_url: SUCCESS_URL,
    cancel_url: CANCEL_URL,
    "line_items[0][price_data][currency]": "mxn",
    "line_items[0][price_data][product_data][name]":
      `Afiliacion ANECAMM - ${club.nombre_club}`,
    "line_items[0][price_data][unit_amount]": "1500",
    "line_items[0][price_data][recurring][interval]": "year",
    "line_items[0][quantity]": "1",
    "metadata[nombre_club]": club.nombre_club,
    "metadata[club_id]": String(club.id),
    "subscription_data[metadata][club_id]": String(club.id),
    client_reference_id: String(club.id),
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
  const uploadedKeys = [];

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
      throw new HttpError("Content-Type invalido. Usa multipart/form-data.", 400);
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

    const tempLogoKey = await uploadTempImage(env.TEMP_IMAGES, logoFile, "logo");
    uploadedKeys.push(tempLogoKey);

    const tempGroupKey = await uploadTempImage(env.TEMP_IMAGES, groupFile, "grupo");
    uploadedKeys.push(tempGroupKey);

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

    clubId = insertResult?.meta?.last_row_id;
    if (!clubId) {
      throw new Error("No se pudo registrar el club pendiente.");
    }

    const session = await createStripeCheckoutSession(env.STRIPE_SECRET_KEY, {
      ...club,
      id: clubId,
    });

    const updateResult = await env.DB.prepare(
      `UPDATE directorio_clubes
      SET stripe_session_id = ?
      WHERE id = ?`
    )
      .bind(session.id, clubId)
      .run();

    if (getChangedRows(updateResult) !== 1) {
      await cleanupTempImages(env.TEMP_IMAGES, uploadedKeys);
      await deletePendingClub(env.DB, clubId);
      throw new Error("No se pudo guardar stripe_session_id para el club.");
    }

    return json({
      ok: true,
      checkoutUrl: session.url,
      id: clubId,
    });
  } catch (error) {
    if (uploadedKeys.length) {
      await cleanupTempImages(env.TEMP_IMAGES, uploadedKeys);
    }

    if (clubId) {
      await deletePendingClub(env.DB, clubId);
    }

    const status = error instanceof HttpError || error instanceof TypeError ? error.status || 400 : 500;

    return json(
      {
        ok: false,
        error: error.message || "Error al crear la sesion de checkout.",
      },
      { status }
    );
  }
}
