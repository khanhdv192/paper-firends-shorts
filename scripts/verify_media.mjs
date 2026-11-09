// Check every Short video against its recorded SHA-256 (posts.json), at the pinned commit Buffer uses and on main.
// A pinned commit URL can never change content; the main-branch check catches anyone editing or replacing a video.
//   node scripts/verify_media.mjs            -> exit 1 on any mismatch (GitHub emails the repo owner on a failed run)
//   ONLY=<key> node scripts/verify_media.mjs
import crypto from "node:crypto";
import fs from "node:fs";

const REPO = "khanhdv192/paper-firends-shorts";
const ONLY = (process.env.ONLY || "").trim();
const { posts } = JSON.parse(fs.readFileSync("posts.json", "utf8"));
export const pinnedUrl = (p) => `https://raw.githubusercontent.com/${REPO}/${p.media_commit}/${p.video}`;
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

async function fetchSha(url) {
  const r = await fetch(url);
  if (!r.ok) return `HTTP ${r.status}`;
  return sha(Buffer.from(await r.arrayBuffer()));
}

let bad = 0;
for (const p of posts.filter((x) => !ONLY || x.key === ONLY)) {
  if (!p.sha256 || !p.media_commit) { console.log(`! ${p.key}: no sha256/media_commit recorded`); bad++; continue; }
  const pinned = await fetchSha(pinnedUrl(p));
  const main = await fetchSha(`https://raw.githubusercontent.com/${REPO}/main/${p.video}`);
  const local = fs.existsSync(p.video) ? sha(fs.readFileSync(p.video)) : "missing";
  const ok = pinned === p.sha256 && main === p.sha256 && local === p.sha256;
  if (!ok) bad++;
  console.log(`${ok ? "ok" : "!!"} ${p.key.padEnd(20)} pinned ${pinned === p.sha256 ? "ok" : pinned.slice(0, 12)}  main ${main === p.sha256 ? "ok" : main.slice(0, 12)}  checkout ${local === p.sha256 ? "ok" : local.slice(0, 12)}`);
}
console.log(bad ? `${bad} video(s) do NOT match their recorded SHA-256` : "all videos match their recorded SHA-256");
process.exit(bad ? 1 : 0);
