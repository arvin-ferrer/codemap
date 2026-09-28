const fs = require("node:fs/promises");
const path = require("node:path");
async function build() {
  const dist = path.join(__dirname, "dist");
  await fs.rm(dist, { recursive: true, force: true });
  await fs.rm(path.join(__dirname, "public"), { recursive: true, force: true });
  await fs.cp(
    path.join(__dirname, "../../apps/backend/dist/review"),
    path.join(dist, "backend"),
    { recursive: true },
  );
  await fs.cp(path.join(__dirname, "../core/dist"), path.join(dist, "core"), {
    recursive: true,
  });
  await fs.cp(
    path.join(__dirname, "../shared/dist"),
    path.join(dist, "shared"),
    { recursive: true },
  );
  // Package local runtime modules without requiring unpublished workspace packages.
  async function rewrite(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await rewrite(file);
      else if (entry.name.endsWith(".js")) {
        let content = await fs.readFile(file, "utf8");
        for (const name of ["core", "shared"]) {
          let relative = path
            .relative(path.dirname(file), path.join(dist, name, "index.js"))
            .split(path.sep)
            .join("/");
          if (!relative.startsWith(".")) relative = "./" + relative;
          content = content
            .replaceAll(`"@codemap/${name}"`, JSON.stringify(relative))
            .replaceAll(`'@codemap/${name}'`, JSON.stringify(relative));
        }
        await fs.writeFile(file, content);
      }
    }
  }
  await rewrite(dist);
  await fs.copyFile(
    path.join(__dirname, "../../LICENSE"),
    path.join(dist, "LICENSE"),
  );
  await fs.cp(
    path.join(__dirname, "../../apps/frontend/out"),
    path.join(__dirname, "public"),
    { recursive: true },
  );
}
build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
