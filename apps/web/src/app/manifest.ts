import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dramatic — Audience-directed short drama",
    short_name: "Dramatic",
    description:
      "Watch the cliffhanger, make the call, and help shape tomorrow's episode.",
    start_url: "/",
    display: "standalone",
    background_color: "#08070A",
    theme_color: "#08070A",
    icons: [
      {
        src: "/brand-mark.png",
        sizes: "256x256",
        type: "image/png",
      },
    ],
  };
}
