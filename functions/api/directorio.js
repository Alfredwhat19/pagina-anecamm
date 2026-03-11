export async function onRequestGet(context) {
  const { env } = context;

  try {
    const { results } = await env.DB.prepare(
      `SELECT
        id,
        nombre_club,
        ciudad_estado,
        instructor,
        red_social,
        estatus
      FROM directorio_clubes
      ORDER BY nombre_club ASC`
    ).all();

    return Response.json(results);
  } catch (error) {
    return new Response(JSON.stringify(error), { status: 500 });
  }
}
