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

  // Search TV first (most anime are TV)
  const tvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${env.TMDB_API_KEY}&query=${query}`;

  const tvRes = await fetch(tvUrl);
  if (tvRes.ok) {
    const tvData = await tvRes.json();

    const animeTv = tvData.results?.find(r =>
      r.poster_path &&
      r.genre_ids?.includes(16) // 16 = Animation
    );

    if (animeTv) {
      return `https://image.tmdb.org/t/p/original${animeTv.poster_path}`;
    }
  }

  // If not found, search Movie
  const movieUrl = `https://api.themoviedb.org/3/search/movie?api_key=${env.TMDB_API_KEY}&query=${query}`;

  const movieRes = await fetch(movieUrl);
  if (!movieRes.ok) return null;

  const movieData = await movieRes.json();

  const animeMovie = movieData.results?.find(r =>
    r.poster_path &&
    r.genre_ids?.includes(16) // 16 = Animation
  );

  if (!animeMovie) return null;

  return `https://image.tmdb.org/t/p/original${animeMovie.poster_path}`;
}
