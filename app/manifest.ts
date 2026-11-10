import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Movie Picker",
    short_name: "Movie Picker",
    description: "A private guide to tonight’s movie.",
    start_url: "/",
    display: "standalone",
    background_color: "#15110f",
    theme_color: "#15110f",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
