import { expect, test } from "bun:test";
import { publishCameraTrack } from "../../apps/web/src/lib/publish-camera";

function cameraFixture() {
  const events: string[] = [];
  const track = {
    detach: () => events.push("detach"),
    stop: () => events.push("stop"),
  };
  let current = true;
  return {
    events,
    invalidate: () => {
      current = false;
    },
    options: {
      create: () => Promise.resolve(track),
      isCurrent: () => current,
      publish: () => {
        events.push("publish");
        return Promise.resolve();
      },
      unpublish: () => {
        events.push("unpublish");
        return Promise.resolve();
      },
    },
    track,
  };
}

test("camera permission arriving after session disposal stops the track without publishing", async () => {
  const fixture = cameraFixture();
  const pending = publishCameraTrack(fixture.options);
  fixture.invalidate();
  expect(await pending).toBeNull();
  expect(fixture.events).toEqual(["stop", "detach"]);
});

test("a camera published into a superseded session is stopped and unpublished", async () => {
  const fixture = cameraFixture();
  const result = await publishCameraTrack({
    ...fixture.options,
    publish: () => {
      fixture.events.push("publish");
      fixture.invalidate();
      return Promise.resolve();
    },
  });
  expect(result).toBeNull();
  expect(fixture.events).toEqual(["publish", "stop", "detach", "unpublish"]);
});

test("publication failure releases the camera even when unpublishing also fails", async () => {
  const fixture = cameraFixture();
  const failure = new Error("Publication failed");
  await expect(
    publishCameraTrack({
      ...fixture.options,
      publish: () => Promise.reject(failure),
      unpublish: () => Promise.reject(new Error("Room already disconnected")),
    })
  ).rejects.toBe(failure);
  expect(fixture.events).toEqual(["stop", "detach"]);
});

test("successful publication transfers a live track to the current session", async () => {
  const fixture = cameraFixture();
  expect(await publishCameraTrack(fixture.options)).toBe(fixture.track);
  expect(fixture.events).toEqual(["publish"]);
});
