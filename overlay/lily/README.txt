Drop Lily's avatar assets in this folder. The overlay auto-detects what exists:

  idle.png   - required baseline. Mouth closed, transparent background.
               Replaces the hologram automatically. (DONE — cut from LILYFULL.png)
  talk.png   - optional. Same image, mouth open. Voice-synced lip flap.

  idle.webm  - optional, BEATS the stills when present. Seamless idle loop
               (breathing, blinking, hair sway). Make with any image-to-video
               tool from LILYFULL.png. Transparent or solid background removed
               first works best (VP9 webm with alpha keeps transparency).
  talk.webm  - optional. Talking loop; plays whole time she speaks, idle.webm
               resumes after.

Image-to-video prompt that works well for this:
  "subtle idle animation, character breathing gently, slight hair sway,
   blinking occasionally, body stays in place, seamless loop, static camera"

Tips:
- Stills: same dimensions for idle/talk. 1000px+ tall.
- Videos: same framing as the still so the swap is invisible.
- Avatar size: --lily-height in style.css (default 46vh).
