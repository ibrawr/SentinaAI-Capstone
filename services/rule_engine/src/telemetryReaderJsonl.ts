import fs from "node:fs";
import readline from "node:readline";
import { TelemetryEvent } from "./types";

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/**
 * Reads JSONL: each line is a JSON object representing one TelemetryEvent.
 * Expected shape:
 * {
 *   readingId, deviceId, zoneId, hallId?, timestamp, readingType, quality, dataSource, values
 * }
 */
export async function streamTelemetryJsonl(
  filePath: string,
  onEvent: (ev: TelemetryEvent) => void | Promise<void>
) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue; // skip bad line
    }

    if (!isObject(parsed)) continue;

    const ev = parsed as Partial<TelemetryEvent>;

    // Basic validation
    if (!ev.readingId || !ev.deviceId || !ev.zoneId || !ev.timestamp || !ev.readingType) continue;
    if (!isObject(ev.values)) continue;

    const normalized: TelemetryEvent = {
      readingId: String(ev.readingId),
      deviceId: String(ev.deviceId),
      zoneId: String(ev.zoneId),
      hallId: ev.hallId ? String(ev.hallId) : null,
      timestamp: String(ev.timestamp),
      readingType: String(ev.readingType),
      quality: ev.quality ? String(ev.quality) : "good",
      dataSource: ev.dataSource ? String(ev.dataSource) : "unknown",
      values: ev.values as Record<string, unknown>,
    };

    await onEvent(normalized);
  }
}
