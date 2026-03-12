const FIVE_MINUTES_IN_SECONDS = 300;

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
    throw new Error("Firma Stripe invalida.");
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
    throw new Error("Falta la firma de Stripe.");
  }

  const { t, v1 } = parseStripeSignature(signatureHeader);
  if (!t || !v1) {
    throw new Error("Firma Stripe incompleta.");
  }

  const timestamp = Number.parseInt(t, 10);
  const now = Math.floor(Date.now() / 1000);

  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > FIVE_MINUTES_IN_SECONDS) {
    throw new Error("Firma Stripe expirada.");
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
    throw new Error("Firma Stripe no valida.");
  }
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

  try {
    const signatureHeader = request.headers.get("stripe-signature");
    const rawBody = await request.text();

    await verifyStripeSignature(rawBody, signatureHeader, env.STRIPE_WEBHOOK_SECRET);

    const event = JSON.parse(rawBody);

    if (event?.type !== "checkout.session.completed") {
      return json({ ok: true, ignored: true });
    }

    const session = event?.data?.object;
    const sessionId = session?.id;
    const paymentIntentId =
      typeof session?.payment_intent === "string" ? session.payment_intent : "";

    if (!sessionId) {
      return json(
        { ok: false, error: "Evento sin session.id." },
        { status: 400 }
      );
    }

    const result = await env.DB.prepare(
      `UPDATE directorio_clubes
      SET
        payment_status = 'paid',
        estatus = 'ACTIVO',
        visible_in_directory = 1,
        stripe_payment_intent_id = ?,
        paid_at = CURRENT_TIMESTAMP
      WHERE stripe_session_id = ?`
    )
      .bind(paymentIntentId, sessionId)
      .run();

    if (!result?.success) {
      return json(
        { ok: false, error: "No se pudo actualizar el registro del club." },
        { status: 500 }
      );
    }

    return json({ ok: true });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error.message || "Error en webhook de Stripe.",
      },
      { status: 400 }
    );
  }
}