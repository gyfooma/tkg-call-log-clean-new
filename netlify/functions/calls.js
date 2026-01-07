export default async () => {
  return new Response(
    JSON.stringify({
      ok: true,
      message: "Netlify function is running"
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }
  );
};
