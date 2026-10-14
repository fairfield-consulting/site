import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import { isEntrypoint, requireCondition } from "./ci-policy.ts";

export async function staticAssets(directory: string) {
  const root = await realpath(directory);
  requireCondition(
    path.isAbsolute(directory) && root === path.resolve(directory),
    "Asset root must be a real dedicated directory.",
  );
  const hash = createHash("sha256");
  let count = 0;
  let total = 0;
  async function visit(relative: string) {
    const full = path.join(root, relative);
    const info = await lstat(full);
    requireCondition(!info.isSymbolicLink(), "Static data cannot contain links.");
    requireCondition((await realpath(full)) === full, "Asset escapes its directory.");
    if (info.isDirectory()) {
      for (const name of (await readdir(full)).sort()) {
        requireCondition(
          name !== "." &&
            name !== ".." &&
            !name.includes("\\") &&
            !/[\r\n]/.test(name) &&
            !name.includes("\0") &&
            (!name.startsWith(".") || (relative === "" && name === ".assetsignore")),
          "Unsafe static asset path.",
        );
        await visit(path.join(relative, name));
      }
    } else {
      requireCondition(
        info.isFile() && info.nlink === 1 && info.size <= 25 * 1024 * 1024,
        "Unsupported/oversized static file.",
      );
      requireCondition(
        ++count <= 20000 && (total += info.size) <= 200 * 1024 * 1024,
        "Static output exceeds native limits.",
      );
      const bytes = await readFile(full);
      hash.update(relative).update("\0").update(String(bytes.length)).update("\0").update(bytes);
    }
  }
  await visit("");
  requireCondition(
    (await lstat(path.join(root, "index.html"))).isFile(),
    "Static preview needs index.html at its root.",
  );
  return { directory: root, digest: hash.digest("hex"), count, bytes: total };
}

if (isEntrypoint(import.meta.url)) {
  try {
    const assets = await staticAssets(path.resolve(process.argv[2] ?? "dist"));
    console.log(`Validated ${assets.count} static files (${assets.bytes} bytes).`);
  } catch {
    console.error("Static output failed data-only validation.");
    process.exitCode = 1;
  }
}
