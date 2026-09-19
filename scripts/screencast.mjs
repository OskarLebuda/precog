/**
 * Captures a page at a real 60 frames per second.
 *
 * Playwright's own `recordVideo` writes about 25 fps and cannot be changed. The Chrome
 * DevTools protocol instead sends a frame whenever the page repaints, each with a timestamp.
 * Those frames are written out with their real durations and resampled to a constant 60 fps
 * by ffmpeg, so motion is smooth and the timing stays true.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const FPS = 60;

export async function startScreencast(page, dir, size) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let index = 0;

  cdp.on("Page.screencastFrame", async (frame) => {
    const file = join(dir, `${String(index++).padStart(6, "0")}.jpg`);
    writeFileSync(file, Buffer.from(frame.data, "base64"));
    frames.push({ file, at: frame.metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
  });

  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    everyNthFrame: 1,
    maxWidth: size.width,
    maxHeight: size.height,
  });

  return {
    async stop(output) {
      await cdp.send("Page.stopScreencast").catch(() => {});
      await cdp.detach().catch(() => {});
      if (frames.length < 2) throw new Error("the screencast captured nothing");

      // The concat demuxer holds each frame for its own duration, which is what makes the
      // resample below keep real timing instead of evening everything out.
      const lines = [];
      for (const [i, frame] of frames.entries()) {
        const next = frames[i + 1];
        lines.push(`file '${resolve(frame.file)}'`);
        if (next) lines.push(`duration ${Math.max(next.at - frame.at, 1 / 240).toFixed(4)}`);
      }
      lines.push(`file '${resolve(frames.at(-1).file)}'`);
      const list = join(dir, "frames.txt");
      writeFileSync(list, `${lines.join("\n")}\n`);

      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          list,
          "-vf",
          `fps=${FPS},format=yuv420p`,
          "-c:v",
          "libx264",
          "-crf",
          "18",
          "-preset",
          "medium",
          output,
        ],
        { stdio: "ignore" },
      );
      rmSync(dir, { recursive: true, force: true });
      return { frames: frames.length, seconds: frames.at(-1).at - frames[0].at };
    },
  };
}
