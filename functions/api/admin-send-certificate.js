import {
  json,
  requireAdminSession,
} from "./_admin-auth.js";

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_CERTIFICATE_TO = "jose.star49@gmail.com";

const parseApiResponse = async (response) => {
  const rawText = await response.text();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    return { rawText };
  }
};

const stripDataUrlPrefix = (value) =>
  String(value || "").replace(/^data:application\/pdf;base64,/, "").trim();

const buildHtml = (club) => `
  <div style="font-family: Arial, sans-serif; color: #172033; line-height: 1.6;">
    <h2 style="margin: 0 0 12px; color: #18315c;">Certificado manual ANECAMM</h2>
    <p style="margin: 0 0 10px;"><strong>Club:</strong> ${club.nombre_club}</p>
    <p style="margin: 0 0 10px;"><strong>Ciudad y estado:</strong> ${club.ciudad_estado}</p>
    <p style="margin: 0 0 10px;"><strong>Instructor:</strong> ${club.instructor}</p>
    <p style="margin: 0 0 10px;"><strong>Folio:</strong> ${club.document_id || "Pendiente"}</p>
    <p style="margin: 16px 0 0;">
      Se adjunta el certificado generado desde el panel administrativo.
    </p>
  </div>
`;

const buildText = (club) =>
  [
    "Certificado manual ANECAMM",
    "",
    `Club: ${club.nombre_club}`,
    `Ciudad y estado: ${club.ciudad_estado}`,
    `Instructor: ${club.instructor}`,
    `Folio: ${club.document_id || "Pendiente"}`,
    "",
    "Se adjunta el certificado generado desde el panel administrativo.",
  ].join("\n");

export async function onRequestPost({ env, request }) {
  if (!env?.DB) {
    return json({ ok: false, error: "DB binding no configurado." }, { status: 500 });
  }

  const auth = await requireAdminSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  if (!env?.RESEND_API_KEY || !env?.RESEND_FROM_EMAIL) {
    return json(
      { ok: false, error: "RESEND_API_KEY o RESEND_FROM_EMAIL no configurados." },
      { status: 500 }
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Payload JSON invalido." }, { status: 400 });
  }

  const clubId = Number.parseInt(payload?.club_id, 10);
  const pdfBase64 = stripDataUrlPrefix(payload?.pdf_base64);
  const filename = String(payload?.filename || `afiliacion-${clubId || "manual"}.pdf`).trim();

  if (!Number.isInteger(clubId) || clubId <= 0) {
    return json({ ok: false, error: "club_id invalido." }, { status: 400 });
  }

  if (!pdfBase64) {
    return json({ ok: false, error: "El certificado PDF es obligatorio." }, { status: 400 });
  }

  const club = await env.DB.prepare(
    `SELECT id, nombre_club, ciudad_estado, instructor, document_id
     FROM directorio_clubes
     WHERE id = ?
     LIMIT 1`
  )
    .bind(clubId)
    .first();

  if (!club) {
    return json({ ok: false, error: "No se encontro el club solicitado." }, { status: 404 });
  }

  const emailTo = env.ADMIN_CERTIFICATE_TO || env.RESEND_TO_EMAIL || DEFAULT_CERTIFICATE_TO;
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `manual-certificate-${clubId}-${club.document_id || "sin-folio"}`,
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [emailTo],
      subject: `Certificado ANECAMM: ${club.nombre_club}`,
      html: buildHtml(club),
      text: buildText(club),
      attachments: [
        {
          filename,
          content: pdfBase64,
          content_type: "application/pdf",
        },
      ],
    }),
  });

  const resendPayload = await parseApiResponse(response);
  if (!response.ok || !resendPayload?.id) {
    return json(
      {
        ok: false,
        error: resendPayload?.error?.message || resendPayload?.rawText || "No se pudo enviar el correo.",
      },
      { status: response.status || 500 }
    );
  }

  return json({
    ok: true,
    data: {
      email_to: emailTo,
      provider_id: resendPayload.id,
    },
  });
}
