import type { MetadataRoute } from "next";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Only the public pages are for search engines; app screens, links with keys and print views are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/credits", "/verify"],
      disallow: ["/r", "/staff", "/kapitan", "/display", "/kiosk", "/t", "/join", "/print", "/login"],
    },
    host: site,
  };
}
