import {
  clearAdminSessionCookie,
  getAdminSession,
  json,
} from "./_admin-auth.js";

export async function onRequestGet({ request }) {
  const session = await getAdminSession(request);

  return json({
    ok: true,
    authenticated: Boolean(session),
    user: session ? "Admin" : null,
  });
}

export async function onRequestPost() {
  return json({ ok: false, error: "Metodo no permitido." }, { status: 405 });
}

export async function onRequestDelete({ request }) {
  return json(
    { ok: true },
    {
      headers: {
        "set-cookie": clearAdminSessionCookie(request),
      },
    }
  );
}
