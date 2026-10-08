import { afterEach, describe, expect, it, vi } from "vitest";

import { chat } from "./local-ai";

const ep = { baseUrl: "http://127.0.0.1:1234/v1", model: "m" };
const ok = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("chat con esquema", () => {
  it("envía response_format con json_schema", async () => {
    const fetch = vi.fn(async () => ok("{}"));
    vi.stubGlobal("fetch", fetch);
    const res = await chat(ep, [{ role: "user", content: "x" }], { schema: { type: "object" } });
    const body = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "registro", strict: true, schema: { type: "object" } },
    });
    expect(res.schemaRejected).toBe(false);
  });

  it("repite sin esquema si el servidor lo rechaza", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("response_format not supported", { status: 400 }))
      .mockResolvedValueOnce(ok('{"a":1}'));
    vi.stubGlobal("fetch", fetch);
    const res = await chat(ep, [{ role: "user", content: "x" }], { schema: { type: "object" } });
    expect(fetch).toHaveBeenCalledTimes(2);
    const second = JSON.parse((fetch.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(second).not.toHaveProperty("response_format");
    expect(res).toMatchObject({ content: '{"a":1}', schemaRejected: true });
  });

  it("no oculta un error del servidor ajeno al esquema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("out of memory", { status: 500 })),
    );
    await expect(chat(ep, [{ role: "user", content: "x" }], { schema: {} })).rejects.toThrow(
      "Error 500: out of memory",
    );
  });
});
