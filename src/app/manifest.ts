import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BlueRoot",
    short_name: "BlueRoot",
    description: "Blue carbon proof registry for community mangroves in Benin",
    start_url: "/en/field",
    scope: "/",
    display: "standalone",
    background_color: "#F5F9F8",
    theme_color: "#0B3C5D",
    lang: "en",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
