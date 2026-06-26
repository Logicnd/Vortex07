import { kv } from "@vercel/kv";

const memoryStore = globalThis.__vortex07RepStore || {
  counts: {},
  voters: {},
};
globalThis.__vortex07RepStore = memoryStore;

function hasKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function getCount(userId) {
  if (hasKv()) {
    const value = await kv.get(`rep:count:${userId}`);
    return Number(value) || 0;
  }
  return Number(memoryStore.counts[userId]) || 0;
}

async function hasVoted(userId, voterId) {
  if (hasKv()) {
    const voted = await kv.sismember(`rep:voters:${userId}`, voterId);
    return Boolean(voted);
  }
  const voters = memoryStore.voters[userId] || [];
  return voters.includes(voterId);
}

async function addVote(userId, voterId) {
  if (hasKv()) {
    const added = await kv.sadd(`rep:voters:${userId}`, voterId);
    if (!added) {
      return { added: false, count: await getCount(userId) };
    }
    const count = await kv.incr(`rep:count:${userId}`);
    return { added: true, count: Number(count) || 0 };
  }

  if (!memoryStore.voters[userId]) memoryStore.voters[userId] = [];
  if (memoryStore.voters[userId].includes(voterId)) {
    return { added: false, count: Number(memoryStore.counts[userId]) || 0 };
  }

  memoryStore.voters[userId].push(voterId);
  memoryStore.counts[userId] = (Number(memoryStore.counts[userId]) || 0) + 1;
  return { added: true, count: memoryStore.counts[userId] };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const userId = String(req.query?.userId || req.body?.userId || "").trim();
  const voterId = String(req.query?.voterId || req.body?.voterId || "").trim();
  const idsParam = String(req.query?.ids || "").trim();

  if (req.method === "GET" && idsParam) {
    if (!voterId || voterId.length < 8 || voterId.length > 80) {
      res.status(400).json({ error: "Invalid voterId" });
      return;
    }

    const ids = idsParam
      .split(",")
      .map((part) => part.trim())
      .filter((id) => /^\d+$/.test(id))
      .slice(0, 50);

    const results = await Promise.all(
      ids.map(async (id) => {
        const count = await getCount(id);
        const voted = voterId ? await hasVoted(id, voterId) : false;
        return { userId: Number(id), count, hasVoted: voted };
      }),
    );

    res.status(200).json({ results });
    return;
  }

  if (!/^\d+$/.test(userId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  if (!voterId || voterId.length < 8 || voterId.length > 80) {
    res.status(400).json({ error: "Invalid voterId" });
    return;
  }

  if (req.method === "GET") {
    const count = await getCount(userId);
    const voted = voterId ? await hasVoted(userId, voterId) : false;
    res.status(200).json({ count, hasVoted: voted });
    return;
  }

  if (req.method === "POST") {
    const result = await addVote(userId, voterId);
    res.status(200).json({
      count: result.count,
      hasVoted: true,
      added: result.added,
    });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
