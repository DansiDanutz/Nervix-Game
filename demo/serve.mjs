import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const PORT = Number(process.env.PORT ?? 8790);
// Read-only fixture access: role via PGOPTIONS, one SELECT per request, JSON out.
const DB = process.env.DEMO_DATABASE_URL ?? "postgresql:///nervix_world?host=/tmp";
const ENV = { ...process.env, PGOPTIONS: "-c role=nervix_demo_ro" };

const BUILDERS = { "/dangg": "bld_dangg", "/testbuilder": "bld_test" };

function query(sql) {
  const out = execFileSync("psql", [DB, "-tA", "-c", sql], { encoding: "utf8", env: ENV }).trim();
  return out ? JSON.parse(out) : null;
}

function builderFor(id) {
  return query(
    `SELECT json_build_object('name', b.name, 'owner', u.display_name, 'appUrl', COALESCE(b.app_url,''))
       FROM builders b JOIN users u ON u.id = b.owner_id WHERE b.id = '${id}'`,
  );
}

function offeringsFor(id) {
  return (
    query(
      `SELECT COALESCE(json_agg(json_build_object('name', name, 'priceMinor', price_minor, 'currency', currency) ORDER BY name), '[]')
         FROM builder_offerings WHERE builder_id = '${id}'`,
    ) ?? []
  );
}

function render(template, id) {
  const b = builderFor(id) ?? { name: id, owner: "unknown", appUrl: "" };
  const rows = offeringsFor(id)
    .map(
      (r) =>
        `<div class="row"><span>${r.name}</span><span>${(r.priceMinor / 100).toFixed(2)} ${r.currency}</span></div>`,
    )
    .join("\n");
  return template
    .replaceAll("{{NAME}}", b.name)
    .replaceAll("{{OWNER}}", `${b.owner} · ${id}`)
    .replaceAll("{{ROWS}}", rows)
    .replaceAll("{{APP_URL}}", b.appUrl || "#");
}

const templates = new Map();
function template(file) {
  if (!templates.has(file)) templates.set(file, fs.readFileSync(path.join(ROOT, file), "utf8"));
  return templates.get(file);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === "/app") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return fs.createReadStream(path.join(ROOT, "app.html")).pipe(res);
    }
    const builder = BUILDERS[url.pathname];
    if (!builder) {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("not found");
    }
    try {
      const html = render(template(builder === "bld_dangg" ? "dangg.html" : "testbuilder.html"), builder);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(html);
    } catch (error) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(`demo read failed: ${error.message}`);
    }
  })
  .listen(PORT, () => console.log(`nervix demo previews on http://localhost:${PORT} (read-only)`));