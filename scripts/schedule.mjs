// Schedule Paper Friends Shorts to TikTok, Instagram Reels and Facebook Reels through the Buffer API.
// Runs in GitHub Actions (see .github/workflows/schedule.yml). Node 20+, no dependencies.
//
//   MODE=channels  list the Buffer organization and its channels (check the 3 accounts are connected)
//   MODE=dry-run   show what would be scheduled now, call nothing that changes Buffer
//   MODE=schedule  create the posts due within config.window_days that are not scheduled yet
//   ONLY=<key>     limit to one Short (for a test); CHANNELS=tiktok,instagram limits the networks
//
// Every post is scheduled at its exact time (customScheduled, dueAt) with the video from this public repo.
// releases.json adds one "new video" post per YouTube release: the YouTube thumbnail image + a link to the official video
// (clickable on Facebook; "link in bio" on Instagram and TikTok). The full video is never uploaded to the social networks.
// AI disclosure: Instagram and TikTok get Buffer's isAiGenerated flag. Buffer has no such flag for Facebook,
// so Facebook captions end with config.facebook_ai_note.
import fs from "node:fs";
import crypto from "node:crypto";

const API = "https://api.buffer.com";
const KEY = process.env.BUFFER_API_KEY;
const MODE = process.env.MODE || "dry-run";
const ONLY = (process.env.ONLY || "").trim();
const CHANNELS = (process.env.CHANNELS || "").split(",").map((s) => s.trim()).filter(Boolean);
const cfg = JSON.parse(fs.readFileSync("config.json", "utf8"));
const posts = [
  ...JSON.parse(fs.readFileSync("posts.json", "utf8")).posts,
  ...(fs.existsSync("releases.json") ? JSON.parse(fs.readFileSync("releases.json", "utf8")).posts : []),
].sort((a, b) => Date.parse(a.publish_at) - Date.parse(b.publish_at));
const STATE = "state/scheduled.json";
const state = JSON.parse(fs.readFileSync(STATE, "utf8"));

async function gql(query, variables = {}) {
  if (!KEY) throw new Error("BUFFER_API_KEY secret is not set (repo Settings -> Secrets and variables -> Actions)");
  const r = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors) throw new Error(`Buffer API ${r.status}: ${JSON.stringify(j.errors || j).slice(0, 600)}`);
  return j.data;
}

async function channels() {
  const { account } = await gql(`query { account { organizations { id name } } }`);
  const orgs = account.organizations;
  const org = cfg.organization ? orgs.find((o) => o.name === cfg.organization || o.id === cfg.organization) : orgs[0];
  if (!org) throw new Error(`organization not found; have: ${orgs.map((o) => o.name).join(", ")}`);
  const { channels } = await gql(`query($id: OrganizationId!) { channels(input: { organizationId: $id }) { id name service } }`, { id: org.id });
  return { org, orgs, channels };
}

// Pinned to the commit recorded in posts.json (media_commit): that URL can never serve different bytes. Before a post is
// created the file is downloaded and checked against its recorded sha256.
const mediaPath = (p) => p.kind === "release" ? p.image : p.video;
function videoUrl(p) {
  if (!p.media_commit || !p.sha256) throw new Error(`${p.key}: media_commit / sha256 missing`);
  return `https://raw.githubusercontent.com/khanhdv192/paper-firends-shorts/${p.media_commit}/${mediaPath(p)}`;
}
async function verifyVideo(p) {
  const r = await fetch(videoUrl(p)); if (!r.ok) throw new Error(`${p.key}: video HTTP ${r.status}`);
  const h = crypto.createHash("sha256").update(Buffer.from(await r.arrayBuffer())).digest("hex");
  if (h !== p.sha256) throw new Error(`${p.key}: media sha256 ${h.slice(0, 12)} != recorded ${p.sha256.slice(0, 12)}, refusing to schedule`);
}

function durationGuessMs(p) { return p.duration_ms || 20000; }

// TikTok has no clickable link in the profile: name the YouTube handle instead of "link in bio"
const forService = (text, service) => service === "tiktok" ? (cfg.tiktok_caption_replace || []).reduce((t, [a, b]) => t.split(a).join(b), text) : text;

function releaseInput(p, service, channelId) {
  const note = cfg.facebook_ai_note;                              // photo posts: no AI flag on TikTok/Facebook, so every caption says it
  const base = service === "facebook" ? p.caption_facebook : p.caption;
  const metadata =
    service === "instagram" ? { instagram: { type: "post", shouldShareToFeed: true, isAiGenerated: true } } :
    service === "facebook" ? { facebook: { type: "post" } } : { tiktok: { title: p.title.slice(0, 90) } };
  return {
    text: forService(`${base}\n\n${note}`, service), channelId, schedulingType: "automatic", mode: "customScheduled",
    dueAt: new Date(p.publish_at).toISOString(), assets: [{ image: { url: videoUrl(p), metadata: { altText: p.alt || p.title } } }], aiAssisted: true, metadata,
  };
}

function input(p, service, channelId) {
  if (p.kind === "release") return releaseInput(p, service, channelId);
  const text = forService(service === "facebook" && cfg.facebook_ai_note ? `${p.caption}\n\n${cfg.facebook_ai_note}` : p.caption, service);
  const metadata =
    service === "instagram" ? { instagram: { type: "reel", shouldShareToFeed: true, isAiGenerated: true } } :
    service === "tiktok" ? { tiktok: { isAiGenerated: true } } :
    service === "facebook" ? { facebook: { type: "reel" } } : undefined;
  const video = { url: videoUrl(p), metadata: { title: p.video_title || p.title } };  // title = Facebook "Reel Title"
  if (service !== "facebook") video.metadata.thumbnailOffset = ( p.thumbnail_offset_ms ?? Math.round(durationGuessMs(p) * (cfg.thumbnail_offset_fraction ?? 0.35)));
  return {
    text, channelId, schedulingType: "automatic", mode: "customScheduled",
    dueAt: new Date(p.publish_at).toISOString(), assets: [{ video }], aiAssisted: true, ...(metadata ? { metadata } : {}),
  };
}

const CREATE = `mutation($input: CreatePostInput!) {
  createPost(input: $input) {
    ... on PostActionSuccess { post { id dueAt } }
    ... on MutationError { message }
  }
}`;

async function main() {
  if (MODE === "channels") {
    const { org, orgs, channels: ch } = await channels();
    console.log("organizations:", orgs.map((o) => `${o.name} (${o.id})`).join(", "));
    console.log("using:", org.name);
    for (const c of ch) console.log(`  ${c.service.padEnd(10)} ${c.name}  ${c.id}`);
    return;
  }
  const now = Date.now(), until = now + cfg.window_days * 864e5, lead = cfg.min_lead_minutes * 6e4;
  const due = posts.filter((p) => !p.manual && (!ONLY || p.key === ONLY) && Date.parse(p.publish_at) > now + lead && (ONLY || Date.parse(p.publish_at) <= until));
  if (!due.length) { console.log("nothing due in the window"); return; }
  for (const p of due) { if (!fs.existsSync(mediaPath(p))) throw new Error(`missing ${mediaPath(p)}`); await verifyVideo(p); }
  const ch = MODE === "schedule" ? (await channels()).channels : [];
  let made = 0, failed = 0;
  for (const p of due) {
    for (const service of p.channels) {
      if (CHANNELS.length && !CHANNELS.includes(service)) continue;
      if (state[p.key]?.[service]) { console.log(`= ${p.key} ${service}: already scheduled (${state[p.key][service]})`); continue; }
      if (MODE !== "schedule") { console.log(`~ ${p.key} ${service} at ${p.publish_at}  ${videoUrl(p)}`); continue; }
      const c = ch.find((x) => x.service === service);
      if (!c) { console.log(`! ${service} channel is not connected in Buffer`); failed++; continue; }
      try {
        const res = (await gql(CREATE, { input: input(p, service, c.id) })).createPost;
        if (res?.post) { (state[p.key] ||= {})[service] = res.post.id; made++; console.log(`+ ${p.key} ${service} ${res.post.dueAt} post ${res.post.id}`); }
        else { failed++; console.log(`! ${p.key} ${service}: ${res?.message || JSON.stringify(res)}`); }
      } catch (e) { failed++; console.log(`! ${p.key} ${service}: ${e.message}`); }
      fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + "\n");
    }
  }
  console.log(`${MODE}: ${made} created, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e.message); process.exit(1); });
