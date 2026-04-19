import {
  createAdminSessionCookie,
  json,
  validateAdminCredentials,
} from "./_admin-auth.js";

export async function onRequestPost({ request }) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Payload JSON invalido." }, { status: 400 });
  }

  if (!validateAdminCredentials(payload?.username, payload?.password)) {
    return json({ ok: false, error: "Credenciales incorrectas." }, { status: 401 });
  }

  const cookie = await createAdminSessionCookie(request);
  return json(
    {
      ok: true,
      user: "Admin",
    },
    {
      headers: {
        "set-cookie": cookie,
      },
    }
  );
}
