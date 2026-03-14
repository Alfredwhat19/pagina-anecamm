const FIVE_MINUTES_IN_SECONDS = 300;
const RESEND_API_URL = "https://api.resend.com/emails";
const EMAIL_TIMEOUT_MS = 10000;
const EMAIL_MAX_ATTEMPTS = 2;
const WELCOME_EMAIL_TO = "jose.star49@gmail.com";

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

const parseStripeSignature = (headerValue) => {
  const parts = headerValue.split(",");
  const parsed = {};

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key && value) {
      parsed[key.trim()] = value.trim();
    }
  }

  return parsed;
};

const hexToUint8Array = (hex) => {
  if (!hex || hex.length % 2 !== 0) {
    throw new HttpError("Firma Stripe invalida.", 400);
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
};

const secureCompare = (a, b) => {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
};

const verifyStripeSignature = async (rawBody, signatureHeader, webhookSecret) => {
  if (!signatureHeader) {
    throw new HttpError("Falta la firma de Stripe.", 400);
  }

  const { t, v1 } = parseStripeSignature(signatureHeader);
  if (!t || !v1) {
    throw new HttpError("Firma Stripe incompleta.", 400);
  }

  const timestamp = Number.parseInt(t, 10);
  const now = Math.floor(Date.now() / 1000);

  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > FIVE_MINUTES_IN_SECONDS) {
    throw new HttpError("Firma Stripe expirada.", 400);
  }

  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signedPayload = `${t}.${rawBody}`;
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    secretKey,
    encoder.encode(signedPayload)
  );

  const expectedSignature = new Uint8Array(signatureBuffer);
  const receivedSignature = hexToUint8Array(v1);

  if (!secureCompare(expectedSignature, receivedSignature)) {
    throw new HttpError("Firma Stripe no valida.", 400);
  }
};

const getChangedRows = (result) => Number(result?.meta?.changes || 0);

const parseJsonPayload = (rawBody) => {
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new HttpError("Payload JSON invalido.", 400);
  }
};

const parseApiResponse = async (response) => {
  const rawText = await response.text();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    return { rawText };
  }
};

const buildProviderError = (prefix, response, payload) => {
  const message = payload?.error?.message || payload?.rawText || `HTTP ${response.status}`;
  return `${prefix}: ${message}`;
};

const getContentTypeFromKey = (key) => {
  const normalized = String(key || "").toLowerCase();
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
};

const getFilenameFromKey = (key, fallbackName) => {
  const segments = String(key || "").split("/");
  const lastSegment = segments[segments.length - 1];
  return lastSegment || fallbackName;
};

const extractClubIdFromInvoice = (invoice) => {
  const metadataClubId =
    invoice?.parent?.subscription_details?.metadata?.club_id ||
    invoice?.subscription_details?.metadata?.club_id ||
    invoice?.lines?.data?.find((line) => line?.metadata?.club_id)?.metadata?.club_id ||
    invoice?.metadata?.club_id;

  const parsed = Number.parseInt(metadataClubId || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const extractClubIdFromSubscription = (subscription) => {
  const parsed = Number.parseInt(subscription?.metadata?.club_id || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getClubById = async (db, id) => {
  if (!id) return null;

  return (
    (await db
      .prepare(
        `SELECT
          id,
          nombre_club,
          payment_status,
          estatus,
          visible_in_directory,
          stripe_session_id,
          stripe_subscription_id,
          stripe_customer_id,
          stripe_payment_intent_id,
          temp_logo_key,
          temp_group_key,
          paid_at,
          facebook_post_id,
          facebook_publish_status,
          facebook_published_at,
          facebook_publish_lock,
          facebook_error
        FROM directorio_clubes
        WHERE id = ?
        LIMIT 1`
      )
      .bind(id)
      .first()) || null
  );
};

const getClubByCheckoutSession = async (db, sessionId, clientReferenceId) => {
  if (sessionId) {
    const bySession = await db
      .prepare(
        `SELECT
          id,
          nombre_club,
          stripe_session_id,
          stripe_subscription_id,
          stripe_customer_id,
          temp_logo_key,
          temp_group_key,
          facebook_published_at,
          facebook_publish_lock
        FROM directorio_clubes
        WHERE stripe_session_id = ?
        LIMIT 1`
      )
      .bind(sessionId)
      .first();

    if (bySession) return bySession;
  }

  const parsedId = Number.parseInt(clientReferenceId || "", 10);
  if (Number.isInteger(parsedId) && parsedId > 0) {
    return getClubById(db, parsedId);
  }

  return null;
};

const getClubBySubscriptionOrCustomer = async (db, subscriptionId, customerId, clubId) => {
  if (subscriptionId) {
    const bySubscription = await db
      .prepare(
        `SELECT
          id,
          nombre_club,
          payment_status,
          estatus,
          visible_in_directory,
          stripe_session_id,
          stripe_subscription_id,
          stripe_customer_id,
          stripe_payment_intent_id,
          temp_logo_key,
          temp_group_key,
          paid_at,
          facebook_post_id,
          facebook_publish_status,
          facebook_published_at,
          facebook_publish_lock,
          facebook_error
        FROM directorio_clubes
        WHERE stripe_subscription_id = ?
        LIMIT 1`
      )
      .bind(subscriptionId)
      .first();

    if (bySubscription) return bySubscription;
  }

  if (clubId) {
    const byClubId = await getClubById(db, clubId);
    if (byClubId) return byClubId;
  }

  if (customerId) {
    const byCustomer = await db
      .prepare(
        `SELECT
          id,
          nombre_club,
          payment_status,
          estatus,
          visible_in_directory,
          stripe_session_id,
          stripe_subscription_id,
          stripe_customer_id,
          stripe_payment_intent_id,
          temp_logo_key,
          temp_group_key,
          paid_at,
          facebook_post_id,
          facebook_publish_status,
          facebook_published_at,
          facebook_publish_lock,
          facebook_error
        FROM directorio_clubes
        WHERE stripe_customer_id = ?
        LIMIT 1`
      )
      .bind(customerId)
      .first();

    if (byCustomer) return byCustomer;
  }

  return null;
};

const getClubForInvoice = async (db, invoice) =>
  getClubBySubscriptionOrCustomer(
    db,
    typeof invoice?.subscription === "string" ? invoice.subscription : "",
    typeof invoice?.customer === "string" ? invoice.customer : "",
    extractClubIdFromInvoice(invoice)
  );

const getClubForSubscriptionEvent = async (db, subscription) =>
  getClubBySubscriptionOrCustomer(
    db,
    typeof subscription?.id === "string" ? subscription.id : "",
    typeof subscription?.customer === "string" ? subscription.customer : "",
    extractClubIdFromSubscription(subscription)
  );

const loadTempImage = async (bucket, key, fallbackName) => {
  if (!key) {
    throw new Error(`Falta la key temporal para ${fallbackName}.`);
  }

  const object = await bucket.get(key);
  if (!object) {
    throw new Error(`No se encontro el archivo temporal: ${key}`);
  }

  const contentType = object.httpMetadata?.contentType || getContentTypeFromKey(key);
  const filename = getFilenameFromKey(key, fallbackName);
  const arrayBuffer = await object.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: contentType });

  return { blob, filename, contentType, arrayBuffer };
};

const fetchWithTimeout = async (url, init = {}, timeoutMs = EMAIL_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Timeout de ${timeoutMs}ms alcanzado.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const withEmailRetry = async (operationName, operation) => {
  let lastError = null;

  for (let attempt = 1; attempt <= EMAIL_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.warn(`Email ${operationName} fallo en intento ${attempt}`, {
        error: error.message,
      });
      if (attempt === EMAIL_MAX_ATTEMPTS) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error(`Fallo desconocido en ${operationName}.`);
};

const arrayBufferToBase64 = (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const buildWelcomeEmailHtml = (club) => `
  <div style="font-family: Arial, sans-serif; color: #172033; line-height: 1.6;">
    <h2 style="margin: 0 0 12px; color: #18315c;">Nueva afiliacion ANECAMM</h2>
    <p style="margin: 0 0 12px;">${club.nombre_club} se integro como miembro activo de ANECAMM.</p>
    <p style="margin: 0 0 18px;">
      Bienvenidos. Que esta nueva etapa llegue con disciplina, crecimiento y muchos logros para todo el equipo.
    </p>
    <p style="margin: 0 0 8px; font-weight: 700;">Logo del club</p>
    <img src="cid:logo-image" alt="Logo del club" style="display: block; max-width: 220px; width: 100%; height: auto; margin-bottom: 18px;" />
    <p style="margin: 0 0 8px; font-weight: 700;">Foto grupal</p>
    <img src="cid:group-image" alt="Foto grupal" style="display: block; max-width: 420px; width: 100%; height: auto;" />
  </div>
`;

const buildWelcomeEmailText = (club) =>
  [
    "Nueva afiliacion ANECAMM",
    "",
    `${club.nombre_club} se integro como miembro activo de ANECAMM.`,
    "Bienvenidos. Que esta nueva etapa llegue con disciplina, crecimiento y muchos logros para todo el equipo.",
    "",
    "Se adjuntan el logo del club y la foto grupal.",
  ].join("\n");

const sendWelcomeEmail = async (env, club) => {
  if (!env?.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY no configurado.");
  }

  if (!env?.RESEND_FROM_EMAIL) {
    throw new Error("RESEND_FROM_EMAIL no configurado.");
  }

  if (!club?.temp_logo_key || !club?.temp_group_key) {
    throw new Error("Faltan imagenes temporales para enviar el correo de bienvenida.");
  }

  const [logoImage, groupImage] = await Promise.all([
    loadTempImage(env.TEMP_IMAGES, club.temp_logo_key, "logo.jpg"),
    loadTempImage(env.TEMP_IMAGES, club.temp_group_key, "grupo.jpg"),
  ]);

  return withEmailRetry("send_welcome_email", async () => {
    const response = await fetchWithTimeout(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `welcome-email-${club.id}`,
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [WELCOME_EMAIL_TO],
        subject: `Nueva afiliacion ANECAMM: ${club.nombre_club}`,
        html: buildWelcomeEmailHtml(club),
        text: buildWelcomeEmailText(club),
        attachments: [
          {
            content: arrayBufferToBase64(logoImage.arrayBuffer),
            filename: logoImage.filename,
            content_type: logoImage.contentType,
            contentId: "logo-image",
          },
          {
            content: arrayBufferToBase64(groupImage.arrayBuffer),
            filename: groupImage.filename,
            content_type: groupImage.contentType,
            contentId: "group-image",
          },
        ],
      }),
    });

    const payload = await parseApiResponse(response);
    if (!response.ok || !payload?.id) {
      throw new Error(buildProviderError("Error enviando correo con Resend", response, payload));
    }

    return payload.id;
  });
};

const cleanupR2Images = async (bucket, keys) => {
  const tasks = keys.filter(Boolean).map((key) => bucket.delete(key));
  const results = await Promise.allSettled(tasks);

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.warn("No se pudo borrar imagen temporal de R2", {
        error: result.reason?.message || String(result.reason),
      });
    }
  });
};

const saveNotificationError = async (db, clubId, errorMessage) => {
  await db
    .prepare(
      `UPDATE directorio_clubes
       SET
         facebook_publish_status = 'email_error',
         facebook_error = ?
       WHERE id = ?`
    )
    .bind(String(errorMessage || "Error desconocido."), clubId)
    .run();
};

const reserveNotificationSend = async (db, clubId, lockToken) => {
  const result = await db
    .prepare(
      `UPDATE directorio_clubes
       SET
         facebook_publish_lock = ?,
         facebook_publish_status = 'sending_email',
         facebook_error = NULL
       WHERE id = ?
         AND facebook_published_at IS NULL
         AND facebook_publish_lock IS NULL`
    )
    .bind(lockToken, clubId)
    .run();

  return getChangedRows(result) === 1;
};

const markNotificationSent = async (db, clubId, providerMessageId, lockToken) => {
  const result = await db
    .prepare(
      `UPDATE directorio_clubes
       SET
         facebook_post_id = ?,
         facebook_published_at = CURRENT_TIMESTAMP,
         facebook_publish_status = 'email_sent',
         facebook_error = NULL,
         facebook_publish_lock = NULL
       WHERE id = ? AND facebook_publish_lock = ? AND facebook_published_at IS NULL`
    )
    .bind(providerMessageId, clubId, lockToken)
    .run();

  return getChangedRows(result) === 1;
};

const markNotificationError = async (db, clubId, errorMessage, lockToken) => {
  await db
    .prepare(
      `UPDATE directorio_clubes
       SET
         facebook_publish_status = 'email_error',
         facebook_error = ?
       WHERE id = ? AND facebook_publish_lock = ?`
    )
    .bind(String(errorMessage || "Error desconocido."), clubId, lockToken)
    .run();
};

const reserveStripeEvent = async (db, eventId) => {
  try {
    const result = await db
      .prepare("INSERT INTO stripe_events(id) VALUES(?)")
      .bind(eventId)
      .run();

    return Boolean(result?.success);
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return false;
    }
    throw error;
  }
};

const releaseStripeEvent = async (db, eventId) => {
  try {
    await db.prepare("DELETE FROM stripe_events WHERE id = ?").bind(eventId).run();
  } catch (error) {
    console.error("No se pudo liberar stripe_event tras error", {
      eventId,
      error: error.message,
    });
  }
};

const handleCheckoutSessionCompleted = async (env, session, eventType) => {
  const sessionId = typeof session?.id === "string" ? session.id : "";
  const subscriptionId =
    typeof session?.subscription === "string" ? session.subscription : "";
  const customerId =
    typeof session?.customer === "string" ? session.customer : "";
  const clientReferenceId =
    typeof session?.client_reference_id === "string" ? session.client_reference_id : "";

  if (!sessionId) {
    throw new HttpError("Evento checkout.session.completed sin session.id.", 400);
  }

  const club = await getClubByCheckoutSession(env.DB, sessionId, clientReferenceId);
  if (!club) {
    throw new Error(`No se encontro club para stripe_session_id=${sessionId}.`);
  }

  const result = await env.DB
    .prepare(
      `UPDATE directorio_clubes
       SET
         stripe_session_id = ?,
         stripe_subscription_id = COALESCE(?, stripe_subscription_id),
         stripe_customer_id = COALESCE(?, stripe_customer_id)
       WHERE id = ?`
    )
    .bind(sessionId, subscriptionId || null, customerId || null, club.id)
    .run();

  if (!result?.success || getChangedRows(result) !== 1) {
    throw new Error(`No se pudo actualizar la correlacion Stripe del club ${club.id}.`);
  }

  console.log("Stripe webhook procesado", {
    eventType,
    clubId: club.id,
    subscriptionId: subscriptionId || null,
  });
};

const maybeSendWelcomeEmail = async (env, club) => {
  if (club.facebook_published_at) {
    if (club.temp_logo_key || club.temp_group_key) {
      await cleanupR2Images(env.TEMP_IMAGES, [club.temp_logo_key, club.temp_group_key]);
    }

    console.log("Correo de bienvenida ya enviado", {
      clubId: club.id,
      subscriptionId: club.stripe_subscription_id || null,
    });
    return;
  }

  if (!club.temp_logo_key || !club.temp_group_key) {
    const missingKeysError = "Faltan temp_logo_key o temp_group_key para enviar el correo.";
    await saveNotificationError(env.DB, club.id, missingKeysError);
    throw new Error(missingKeysError);
  }

  const lockToken = crypto.randomUUID();
  const reserved = await reserveNotificationSend(env.DB, club.id, lockToken);

  if (!reserved) {
    const currentClub = await getClubById(env.DB, club.id);

    if (currentClub?.facebook_published_at) {
      if (currentClub.temp_logo_key || currentClub.temp_group_key) {
        await cleanupR2Images(env.TEMP_IMAGES, [
          currentClub.temp_logo_key,
          currentClub.temp_group_key,
        ]);
      }
      return;
    }

    if (currentClub?.facebook_publish_lock) {
      console.warn("Email send lock ya reservado", {
        clubId: club.id,
        subscriptionId: club.stripe_subscription_id || null,
      });
      return;
    }

    throw new Error(`No se pudo reservar el envio de correo para el club ${club.id}.`);
  }

  try {
    const emailId = await sendWelcomeEmail(env, club);
    const saved = await markNotificationSent(env.DB, club.id, emailId, lockToken);

    if (!saved) {
      throw new Error(`No se pudo guardar el envio de correo para el club ${club.id}.`);
    }

    await cleanupR2Images(env.TEMP_IMAGES, [club.temp_logo_key, club.temp_group_key]);

    console.log("Correo de bienvenida enviado", {
      clubId: club.id,
      subscriptionId: club.stripe_subscription_id || null,
    });
  } catch (error) {
    await markNotificationError(env.DB, club.id, error.message, lockToken);
    throw error;
  }
};

const handleInvoicePaid = async (env, invoice, eventType) => {
  const subscriptionId =
    typeof invoice?.subscription === "string" ? invoice.subscription : "";
  const customerId =
    typeof invoice?.customer === "string" ? invoice.customer : "";
  const paymentIntentId =
    typeof invoice?.payment_intent === "string" ? invoice.payment_intent : "";

  const club = await getClubForInvoice(env.DB, invoice);
  if (!club) {
    throw new Error("No se encontro club para invoice.paid.");
  }

  const activationResult = await env.DB
    .prepare(
      `UPDATE directorio_clubes
       SET
         payment_status = 'paid',
         estatus = 'ACTIVO',
         visible_in_directory = 1,
         stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id),
         stripe_subscription_id = COALESCE(?, stripe_subscription_id),
         stripe_customer_id = COALESCE(?, stripe_customer_id),
         paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP)
       WHERE id = ? AND payment_status != 'paid'`
    )
    .bind(paymentIntentId || null, subscriptionId || null, customerId || null, club.id)
    .run();

  console.log("Stripe webhook procesado", {
    eventType,
    clubId: club.id,
    subscriptionId: subscriptionId || club.stripe_subscription_id || null,
  });

  const refreshedClub = await getClubById(env.DB, club.id);
  if (!refreshedClub) {
    throw new Error(`No se pudo recargar el club ${club.id} despues de invoice.paid.`);
  }

  if (getChangedRows(activationResult) === 0 && refreshedClub.payment_status === "paid") {
    console.log("Activacion omitida por idempotencia", {
      eventType,
      clubId: refreshedClub.id,
      subscriptionId: refreshedClub.stripe_subscription_id || subscriptionId || null,
    });
  }

  try {
    await maybeSendWelcomeEmail(env, refreshedClub);
  } catch (error) {
    await saveNotificationError(env.DB, refreshedClub.id, error.message);
    throw error;
  }
};

const handleInvoicePaymentFailed = async (env, invoice, eventType) => {
  const subscriptionId =
    typeof invoice?.subscription === "string" ? invoice.subscription : "";
  const customerId =
    typeof invoice?.customer === "string" ? invoice.customer : "";

  const club = await getClubForInvoice(env.DB, invoice);
  if (!club) {
    throw new Error("No se encontro club para invoice.payment_failed.");
  }

  const result = await env.DB
    .prepare(
      `UPDATE directorio_clubes
       SET
         payment_status = 'past_due',
         estatus = 'INACTIVO',
         visible_in_directory = 0,
         stripe_subscription_id = COALESCE(?, stripe_subscription_id),
         stripe_customer_id = COALESCE(?, stripe_customer_id)
       WHERE id = ?`
    )
    .bind(subscriptionId || null, customerId || null, club.id)
    .run();

  if (!result?.success || getChangedRows(result) !== 1) {
    throw new Error(`No se pudo actualizar el club ${club.id} a past_due.`);
  }

  console.log("Stripe webhook procesado", {
    eventType,
    clubId: club.id,
    subscriptionId: subscriptionId || club.stripe_subscription_id || null,
  });
};

const handleSubscriptionDeleted = async (env, subscription, eventType) => {
  const subscriptionId =
    typeof subscription?.id === "string" ? subscription.id : "";
  const customerId =
    typeof subscription?.customer === "string" ? subscription.customer : "";

  const club = await getClubForSubscriptionEvent(env.DB, subscription);
  if (!club) {
    throw new Error("No se encontro club para customer.subscription.deleted.");
  }

  const result = await env.DB
    .prepare(
      `UPDATE directorio_clubes
       SET
         payment_status = 'cancelled',
         estatus = 'INACTIVO',
         visible_in_directory = 0,
         stripe_subscription_id = COALESCE(?, stripe_subscription_id),
         stripe_customer_id = COALESCE(?, stripe_customer_id)
       WHERE id = ?`
    )
    .bind(subscriptionId || null, customerId || null, club.id)
    .run();

  if (!result?.success || getChangedRows(result) !== 1) {
    throw new Error(`No se pudo cancelar el club ${club.id}.`);
  }

  console.log("Stripe webhook procesado", {
    eventType,
    clubId: club.id,
    subscriptionId: subscriptionId || club.stripe_subscription_id || null,
  });
};

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env?.DB) {
    return json({ ok: false, error: "DB binding no configurado." }, { status: 500 });
  }

  if (!env?.STRIPE_WEBHOOK_SECRET) {
    return json(
      { ok: false, error: "STRIPE_WEBHOOK_SECRET no configurado." },
      { status: 500 }
    );
  }

  if (!env?.TEMP_IMAGES) {
    return json(
      { ok: false, error: "TEMP_IMAGES binding no configurado." },
      { status: 500 }
    );
  }

  const signatureHeader = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  try {
    await verifyStripeSignature(rawBody, signatureHeader, env.STRIPE_WEBHOOK_SECRET);

    const event = parseJsonPayload(rawBody);
    const eventId = typeof event?.id === "string" ? event.id : "";
    const eventType = typeof event?.type === "string" ? event.type : "";

    if (!eventId) {
      throw new HttpError("Evento Stripe sin id.", 400);
    }

    const reserved = await reserveStripeEvent(env.DB, eventId);
    if (!reserved) {
      return json({ ok: true, duplicate: true, event: eventType || null });
    }

    try {
      if (eventType === "checkout.session.completed") {
        await handleCheckoutSessionCompleted(env, event.data?.object, eventType);
        return json({ ok: true, handled: eventType });
      }

      if (eventType === "invoice.paid") {
        await handleInvoicePaid(env, event.data?.object, eventType);
        return json({ ok: true, handled: eventType });
      }

      if (eventType === "invoice.payment_failed") {
        await handleInvoicePaymentFailed(env, event.data?.object, eventType);
        return json({ ok: true, handled: eventType });
      }

      if (eventType === "customer.subscription.deleted") {
        await handleSubscriptionDeleted(env, event.data?.object, eventType);
        return json({ ok: true, handled: eventType });
      }

      return json({ ok: true, ignored: true, event: eventType || null });
    } catch (error) {
      await releaseStripeEvent(env.DB, eventId);
      throw error;
    }
  } catch (error) {
    return json(
      {
        ok: false,
        error: error.message || "Error en webhook de Stripe.",
      },
      { status: error instanceof HttpError ? error.status : 500 }
    );
  }
}
