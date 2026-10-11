# Homepage video

The [homepage](https://bargainingforourminds.org/) embeds the introduction from a separate Cloudflare Workers Static Assets deployment. The science letter and its signing service keep their existing routes.

The supplied video is 30 seconds, 1920 × 1080, with H.264 video and AAC audio. It is remuxed with `-c copy -movflags +faststart` so playback can start before the whole file downloads. No re-encoding is needed. The homepage uses native video controls with sound, inline playback on phones, and no autoplay. It fetches the video only when the visitor chooses to play.

Prepare `public/introduction.mp4` from the source MP4 and `public/introduction-poster.jpg` from its opening frame. Both files stay out of Git. The deployment build records the MP4 byte length in `media.json` for seek responses. Deploy with the existing Wrangler installation:

```sh
cd services/bargaining-media
../letter-signing/node_modules/.bin/wrangler deploy
```

The small Worker serves byte ranges for the MP4 because the static-assets response did not honor `Range` requests. It streams the selected bytes without buffering the whole video. Run `node --test services/bargaining-media/worker.test.mjs` from the repository root to check playback and seeking responses.

Public media lives at [bargaining-media.jameslbarnes.workers.dev](https://bargaining-media.jameslbarnes.workers.dev/introduction.mp4). The homepage source is [index.html](../../index.html), with styles and error handling in [site/home](../../site/home/).
