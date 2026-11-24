
# Art Void

> 🎨 Art Void is a minimalistic theme for art portfolio + blog sites. Built with [Astro](https://astro.build/) and [TailwindCSS](https://tailwindcss.com/), it offers a clean, elegant canvas for artists and creators to showcase their work and share insights. Features a built-in dark mode for a refined viewing experience.

<!-- screenshot -->
![Art Void Screenshot](https://github.com/Arsaev/art-void/blob/main/public/Screenshot1.png)

## Features

- **Minimalistic Design**
- **Portfolio & Blog Support**
- **Dark Mode**
- **Built with TailwindCSS**
- **Responsive**



## Getting Started

1. Clone the repository:
```bash
# Clone the repository
git clone https://github.com/Arsaev/art-void.git
cd art-void
# Install dependencies
npm i
# Start the development server
npm run dev
```

## Credits
This project was builds on top of [void-astro](https://github.com/eAntillon/void-astro) byErick Antillón(s)


## Gallery controls and private paintings

All galleries share searchable Medium multiselect, availability and date controls. Missing status means available; `status: "Sold"` marks a sold painting. Dates use the existing year/month fields. The homepage shows up to 20 matching paintings.

Add `visibility: private` to a painting's frontmatter to hide it until the private collection is unlocked. Existing paintings remain public. Private image requests are deferred until the painting is revealed.

Share `/art#password=URL_ENCODED_PASSWORD` to unlock automatically. `?password=…` is also supported, but fragments avoid sending the password to hosting logs. The password is removed from the address bar immediately; the unlock lasts for the current tab session. Filters can also be shared with repeated `medium` parameters, `status=sold` or `status=available`, and `order=oldest` (default newest).

Passwords are verified with Web Crypto PBKDF2-SHA-256, a random 16-byte salt and 600,000 iterations, requiring HTTPS or localhost. To add or rotate passwords, run `node scripts/art-password.mjs`, enter the password on stdin and end input with Ctrl-D. Copy the resulting verifier into the `accessKeys` array in `src/utils/art-access.js`; each entry unlocks the same private collection. Only salted hashes are committed.

This is a static-site browsing gate: the HTML, JavaScript and image files are public, and a visitor can bypass client-side hiding. Use authenticated hosting if the images need actual access protection.

Run the focused regression check with `node scripts/check-art.mjs`.

## Painting images and carousel

`heroImage` stays the gallery preview and the first image in the viewer. Add optional close-ups to a painting's frontmatter:

```yaml
heroImage: "/artworks/painting.jpeg"
closeups:
  - src: "/artworks/painting-detail.jpeg"
    alt: "Close-up of the brushwork on the hand"
  - src: "/artworks/painting-texture.jpeg"
    alt: "Detail of the paint texture"
```

Choose thumbnails to inspect details. Use Previous/Next painting, Left/Right keys, or swipe horizontally across the viewer to browse paintings without closing the viewer. Navigation wraps and follows the visible gallery's filters, date order and homepage limit. Escape closes the viewer.
