import { describe, expect, test } from "bun:test";

import { dataUrlToBlob, mapWithConcurrency } from "./image-utils";

describe("dataUrlToBlob", () => {
    test("decodes base64 data urls without fetch", async () => {
        const dataUrl = "data:image/png;base64,aGVsbG8=";
        const blob = dataUrlToBlob(dataUrl);
        expect(blob.type).toBe("image/png");
        expect(blob.size).toBe(5);
        expect(await blob.text()).toBe("hello");
    });
});

describe("mapWithConcurrency", () => {
    test("keeps order and respects concurrency", async () => {
        let active = 0;
        let peak = 0;
        const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
            active += 1;
            peak = Math.max(peak, active);
            await new Promise((resolve) => setTimeout(resolve, 20));
            active -= 1;
            return value * 10;
        });
        expect(results).toEqual([10, 20, 30, 40]);
        expect(peak).toBeLessThanOrEqual(2);
    });
});
