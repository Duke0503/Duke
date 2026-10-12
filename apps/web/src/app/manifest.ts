import type { MetadataRoute } from "next";

/**
 * The install prompt's data: what Duke is called once it is on the home screen.
 *
 * A phone app that is used by talking into it should be **installed**, not opened in a browser
 * tab — a tab loses the microphone permission often, and the address bar takes a strip off the
 * top of a screen that is already only 390px wide. `display: "standalone"` is the part that
 * makes it open like an app.
 *
 * `start_url` is `/` and there is nothing else to configure: every screen is reached from the
 * tab bar, so wherever the app was closed, opening at Home is the right place to be.
 *
 * The colour here is the shell background (`--duke-bg`), so the splash screen does not flash a
 * white rectangle before the dark app appears — which is the one visual bug a dark app always
 * shows on install day.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Duke",
    short_name: "Duke",
    description: "Talk out loud to a friend who speaks English with you.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0f12",
    theme_color: "#0b0f12",
    icons: [
      {
        // The SVG mark in `app/icon.svg`. Chrome and Firefox accept it for the install prompt.
        // A 192px and 512px PNG pair is still what an iPhone wants for the home screen, which
        // is the one icon job this cannot do.
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
