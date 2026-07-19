import fs from "fs";
const path = process.argv[2];
const lines = fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
for (const l of lines) {
  let o; try { o = JSON.parse(l); } catch { continue; }
  const role = o.type || o.role || (o.message && o.message.role);
  const msg = o.message || o;
  const texts = [];
  if (typeof msg.content === "string") texts.push(msg.content);
  else if (Array.isArray(msg.content)) {
    for (const c of msg.content) {
      if (c.type === "text") texts.push("[TEXT] " + c.text);
      else if (c.type === "tool_use") texts.push("[TOOL:" + c.name + "] " + JSON.stringify(c.input).slice(0, 400));
      else if (c.type === "tool_result") { const t = typeof c.content === "string" ? c.content : JSON.stringify(c.content); texts.push("[RESULT] " + t.slice(0, 250)); }
    }
  }
  const t = texts.join(" ").trim();
  if (t) console.log("=== " + (role || "?") + " ===\n" + t.slice(0, 1500) + "\n");
}
