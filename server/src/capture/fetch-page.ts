import { BadRequestException } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import ipaddr from "ipaddr.js";
// Validate and pin every resolved IP, including redirects, to prevent private-network access.
export async function fetchPage(value: string, redirects = 0): Promise<string> {
  if (redirects > 4) throw new BadRequestException("Too many page redirects.");
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new BadRequestException("That link cannot be read.");
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), {
    all: true,
  });
  if (
    !addresses.length ||
    addresses.some((a) => ipaddr.process(a.address).range() !== "unicast")
  )
    throw new BadRequestException("That link cannot be read.");
  const address = addresses[0]!;
  return new Promise<string>((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        timeout: 15000,
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
        headers: {
          "User-Agent": "PlanBreezeBot/1.0 (+https://planbreeze.com)",
          Accept: "text/html",
        },
      },
      (res) => {
        if (
          [301, 302, 303, 307, 308].includes(res.statusCode ?? 0) &&
          res.headers.location
        ) {
          res.resume();
          resolve(
            fetchPage(new URL(res.headers.location, url).href, redirects + 1),
          );
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new BadRequestException("Could not open that page."));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 500000) {
            res.destroy();
            reject(new BadRequestException("This page is too large."));
          } else chunks.push(chunk);
        });
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      },
    );
    request.on("timeout", () =>
      request.destroy(new Error("Page request timed out.")),
    );
    request.on("error", reject);
    request.end();
  });
}
