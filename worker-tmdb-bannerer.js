export default {
  async scheduled(event, env, ctx) {
    await updateHighResImages(env);
  }
};

async function updateHighResImages(env) {

  // Get anime needing better images
  const { results } = await env.DB.prepare(`
    SELECT id, title, year
    FROM anime_info
    WHERE image IS NULL
   OR image LIKE '%anilist%'
   OR image NOT LIKE '%image.tmdb.org%'
    LIMIT 30
  `).all();

  for (const anime of results) {
    try {
      const poster = await fetchHighResPoster(env, anime.title, anime.year);

      if (!poster) continue;

      await env.DB.prepare(`
        UPDATE anime_info
        SET image = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(poster, anime.id).run();

    } catch (err) {
      console.log("IMAGE UPDATE FAILED:", anime.title);
    }
  }
}
async function fetchHighResPoster(env, title, year) {

  const query = encodeURIComponent(title.trim());

  const url = `https://api.themoviedb.org/3/search/multi?api_key=${env.TMDB_API_KEY}&query=${query}`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (!data.results?.length) return null;

  // Score results
  let bestScore = 0;
  let bestMatch = null;

  for (const result of data.results) {

    if (!result.poster_path) continue;

    // Prefer anime-like content
    if (result.media_type !== "tv" && result.media_type !== "movie")
      continue;

    let score = 0;

    // Title similarity
    const resultTitle =
      result.title || result.name || "";

    if (resultTitle.toLowerCase() === title.toLowerCase())
      score += 5;

    if (resultTitle.toLowerCase().includes(title.toLowerCase()))
      score += 3;

    // Year match bonus
    const resultYear = (
      result.release_date ||
      result.first_air_date ||
      ""
    ).split("-")[0];

    if (year && resultYear) {
      if (Math.abs(Number(resultYear) - Number(year)) <= 1)
        score += 3;
    }

    // Prefer TV
    if (result.media_type === "tv")
      score += 2;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = result;
    }
  }

  if (!bestMatch) return null;

  return `https://image.tmdb.org/t/p/original${bestMatch.poster_path}`;
}