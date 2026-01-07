export const handler = async (event) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing Twilio credentials" }),
    };
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  // Optional query params:
  //  - hours=24  (default)
  //  - maxPages=10 (default)
  const hours = Number(event.queryStringParameters?.hours ?? "24");
  const maxPages = Number(event.queryStringParameters?.maxPages ?? "10");
  const pageSize = 100;

  const cutoffMs = Date.now() - hours * 60 * 60 * 1000;

  let page = 0;
  let all = [];
  let nextPageUri = `/2010-04-01/Accounts/${accountSid}/Calls.json?PageSize=${pageSize}`;

  while (nextPageUri && page < maxPages) {
    page += 1;

    const url = `https://api.twilio.com${nextPageUri}`;
    const r = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!r.ok) {
      const text = await r.text();
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Twilio API error", status: r.status, details: text }),
      };
    }

    const data = await r.json();
    const calls = data.calls || [];

    // Keep inbound-ish calls
    const inbound = calls.filter((c) => (c.direction || "").startsWith("inbound"));

    // Apply cutoff: keep calls whose start_time or date_created is within window
    const filtered = inbound.filter((c) => {
      const t = Date.parse(c.start_time || c.date_created || "");
      return Number.isFinite(t) ? t >= cutoffMs : true;
    });

    all.push(...filtered);

    // If the oldest call on this page is already older than cutoff, we can stop early
    // (Twilio returns most recent first).
    const oldest = calls[calls.length - 1];
    const oldestMs = oldest ? Date.parse(oldest.start_time || oldest.date_created || "") : NaN;
    if (Number.isFinite(oldestMs) && oldestMs < cutoffMs) {
      break;
    }

    nextPageUri = data.next_page_uri; // Twilio provides this when more pages exist
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hours,
      pagesFetched: page,
      count: all.length,
      calls: all.map((c) => ({
        sid: c.sid,
        from: c.from,
        to: c.to,
        direction: c.direction,
        start_time: c.start_time,
        duration: c.duration,
        status: c.status,
      })),
    }),
  };
};
