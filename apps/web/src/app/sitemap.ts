import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: "weekly",
      priority: 1,
      images: [
        `${siteUrl}/media/the-last-alibi.png`,
        `${siteUrl}/media/borrowed-vows.png`,
        `${siteUrl}/media/the-heir-upstairs.png`,
        `${siteUrl}/media/two-rings-at-the-funeral.png`,
      ],
    },
  ];
}
