const FACEBOOK_GRAPH_API_BASE = "https://graph.facebook.com/v22.0";

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

const publishFacebookTestPost = async (pageId, accessToken) => {
  const body = new URLSearchParams({
    access_token: accessToken,
    message: "Prueba de autopost ANECAMM - no borrar",
  });

  const response = await fetch(`${FACEBOOK_GRAPH_API_BASE}/${pageId}/feed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = await parseApiResponse(response);

  if (!response.ok) {
    return json(
      {
        ok: false,
        error: "Facebook devolvio un error al publicar la prueba.",
        facebook: payload,
      },
      { status: response.status }
    );
  }

  return json({
    ok: true,
    facebook: payload,
  });
};

export async function onRequestGet({ env }) {
  if (!env?.FACEBOOK_PAGE_ID || !env?.FACEBOOK_PAGE_TOKEN) {
    return json(
      {
        ok: false,
        error: "FACEBOOK_PAGE_ID o FACEBOOK_PAGE_TOKEN no configurados.",
      },
      { status: 500 }
    );
  }

  try {
    return await publishFacebookTestPost(env.FACEBOOK_PAGE_ID, env.FACEBOOK_PAGE_TOKEN);
  } catch (error) {
    return json(
      {
        ok: false,
        error: error?.message || "No se pudo publicar la prueba en Facebook.",
      },
      { status: 500 }
    );
  }
}

export const onRequestPost = onRequestGet;
