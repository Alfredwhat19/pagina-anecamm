const RESEND_API_URL = "https://api.resend.com/emails";
const TEST_EMAIL_TO = "jose.star49@gmail.com";

const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
    ...init,
  });

const parseApiResponse = async (response) => {
  const rawText = await response.text();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    return { rawText };
  }
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

const getAssetUrl = (requestUrl, relativePath) =>
  new URL(relativePath, requestUrl).toString();

const loadImageAsAttachment = async (requestUrl, relativePath, fallbackName, contentType) => {
  const response = await fetch(getAssetUrl(requestUrl, relativePath));
  if (!response.ok) {
    throw new Error(`No se pudo cargar la imagen de prueba: ${relativePath}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    filename: fallbackName,
    contentType,
    content: arrayBufferToBase64(arrayBuffer),
  };
};

const buildEmailHtml = () => `
  <div style="font-family: Arial, sans-serif; color: #172033; line-height: 1.6;">
    <h2 style="margin: 0 0 12px; color: #18315c;">Prueba de correo ANECAMM</h2>
    <p style="margin: 0 0 12px;">Este es un correo de prueba para validar el nuevo flujo de bienvenida.</p>
    <p style="margin: 0 0 18px;">
      Bienvenidos. Que esta nueva etapa llegue con disciplina, crecimiento y muchos logros para todo el equipo.
    </p>
    <p style="margin: 0 0 8px; font-weight: 700;">Logo del club</p>
    <img src="cid:logo-image" alt="Logo del club" style="display: block; max-width: 220px; width: 100%; height: auto; margin-bottom: 18px;" />
    <p style="margin: 0 0 8px; font-weight: 700;">Foto grupal</p>
    <img src="cid:group-image" alt="Foto grupal" style="display: block; max-width: 420px; width: 100%; height: auto;" />
  </div>
`;

const buildEmailText = () =>
  [
    "Prueba de correo ANECAMM",
    "",
    "Este es un correo de prueba para validar el nuevo flujo de bienvenida.",
    "Bienvenidos. Que esta nueva etapa llegue con disciplina, crecimiento y muchos logros para todo el equipo.",
  ].join("\n");

const sendTestEmail = async (requestUrl, apiKey, fromEmail) => {
  const [logoImage, groupImage] = await Promise.all([
    loadImageAsAttachment(
      requestUrl,
      "/frontend/assets/images/LogoC.png",
      "logo-anecamm.png",
      "image/png"
    ),
    loadImageAsAttachment(
      requestUrl,
      "/frontend/assets/images/Evento.jpg",
      "foto-grupal.jpg",
      "image/jpeg"
    ),
  ]);

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "anecamm-email-test",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [TEST_EMAIL_TO],
      subject: "Prueba correo ANECAMM",
      html: buildEmailHtml(),
      text: buildEmailText(),
      attachments: [
        {
          content: logoImage.content,
          filename: logoImage.filename,
          content_type: logoImage.contentType,
          contentId: "logo-image",
        },
        {
          content: groupImage.content,
          filename: groupImage.filename,
          content_type: groupImage.contentType,
          contentId: "group-image",
        },
      ],
    }),
  });

  const payload = await parseApiResponse(response);

  if (!response.ok) {
    return json(
      {
        ok: false,
        error: "Resend devolvio un error al enviar el correo de prueba.",
        resend: payload,
      },
      { status: response.status }
    );
  }

  return json({
    ok: true,
    resend: payload,
  });
};

export async function onRequestGet({ env, request }) {
  if (!env?.RESEND_API_KEY || !env?.RESEND_FROM_EMAIL) {
    return json(
      {
        ok: false,
        error: "RESEND_API_KEY o RESEND_FROM_EMAIL no configurados.",
      },
      { status: 500 }
    );
  }

  try {
    return await sendTestEmail(request.url, env.RESEND_API_KEY, env.RESEND_FROM_EMAIL);
  } catch (error) {
    return json(
      {
        ok: false,
        error: error?.message || "No se pudo enviar el correo de prueba.",
      },
      { status: 500 }
    );
  }
}

export const onRequestPost = onRequestGet;
