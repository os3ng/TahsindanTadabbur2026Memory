TAHSIN DAN TADABBUR 2026 MEMORY — PERSISTENT MUSIC SHELL

HOW IT WORKS
- index.html is now the persistent shell.
- home.html and gallery.html are separate content pages loaded inside the shell.
- The music player lives in index.html, so changing Home <-> Gallery does NOT reload the audio element.
- Supabase uploads, carousel, gallery, owner-only delete and auto refresh remain in page.js.

IMPORTANT
- Always publish/open index.html as the public entry page.
- Do not send people directly to home.html or gallery.html if you want continuous music.
- The public URL should be your normal GitHub Pages root URL.

FILES TO REPLACE/ADD
index.html
home.html
gallery.html
style.css
page.js
shell.css
shell.js
config.js
river-flows-in-you.mp4
golden-hour-piano.mp4
pergi-aizat-amdan.mp4

Supabase setup.sql does not need to be rerun if your current database already works.

GITHUB CLI
git add .
git commit -m "Add persistent music shell"
git push origin main
