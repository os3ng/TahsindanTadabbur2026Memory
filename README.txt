TAHSIN DAN TADABBUR 2026 MEMORY — SHARED VERSION

WHAT IS ALREADY DONE
- Your Supabase project URL is already placed in config.js.
- Your public/anon key is already placed in config.js.
- Uploads now go to Supabase instead of localStorage.
- Everyone sees the same memories.
- Users get an anonymous Supabase identity automatically.
- A delete button appears only on memories uploaded by the current anonymous user.
- Database and Storage policies also prevent users from deleting other people's uploads.
- The carousel and music from your latest version are retained.
- The page checks for teammates' new uploads every 20 seconds.

YOU ONLY NEED TO DO THESE STEPS

1) SUPABASE: ENABLE ANONYMOUS SIGN-IN
   Open your Supabase project.
   Go to Authentication -> Providers (or Sign In / Providers depending on the current UI).
   Find Anonymous Sign-Ins and enable it.

2) SUPABASE: RUN THE SQL
   Go to SQL Editor -> New query.
   Open setup.sql from this folder.
   Copy ALL of it into the SQL Editor.
   Click Run.
   It creates the memories table, security rules, and the memories Storage bucket.

3) TEST LOCALLY
   Because this site uses Supabase modules over HTTPS, using a small local web server is better than double-clicking index.html.
   Easy VS Code method: install/use Live Server and open index.html with Live Server.
   Upload one image under 4 MB.
   It should appear in the gallery and carousel.

4) TEST OWNER-ONLY DELETE
   In Chrome, upload Photo A.
   In an Incognito window or another browser, upload Photo B.
   Chrome should show the delete icon only on Photo A.
   The other browser should show the delete icon only on Photo B.

5) PUBLISH ON GITHUB PAGES
   Create a PUBLIC GitHub repository, e.g. tahsin-tadabbur-2026-memory.
   Upload these five website files to the repository root:
     index.html
     style.css
     script.js
     config.js
     music.mp3
   setup.sql and README.txt do not need to be published, but it is okay if they are.

   Then go to repository Settings -> Pages.
   Source: Deploy from a branch
   Branch: main
   Folder: / (root)
   Save.

   GitHub will give you a public URL similar to:
   https://YOUR-USERNAME.github.io/tahsin-tadabbur-2026-memory/

IMPORTANT SECURITY NOTES
- config.js contains only the PUBLIC anon key. That is okay to expose in browser code when RLS is enabled.
- NEVER put your Supabase service_role/secret key in this website or GitHub.
- Anonymous ownership is tied to the browser's Supabase session. If someone clears site data or uses a new device/browser, they may no longer be recognized as the owner of older uploads.
