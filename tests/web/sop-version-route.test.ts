import { expect, test } from "bun:test";
import { sopVersionPath } from "../../apps/web/src/lib/sop-version-route";

test("duplicate display labels navigate to distinct immutable version identities", () => {
  const first = { sopId: "keyboard-sop", version: "1.0.0", versionNumber: 1 };
  const second = { sopId: "keyboard-sop", version: "1.0.0", versionNumber: 2 };
  expect(sopVersionPath(first)).toBe("/sops/keyboard-sop/versions/1");
  expect(sopVersionPath(second)).toBe("/sops/keyboard-sop/versions/2");
  const renamed = { ...second, version: "2.4.0" };
  expect(sopVersionPath(renamed)).toBe(sopVersionPath(second));
});
