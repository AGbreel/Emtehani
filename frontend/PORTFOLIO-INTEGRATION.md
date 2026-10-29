# Emtehani Frontend — Portfolio integration

## What changed
- Connected `src/DeveloperPage.jsx` to the main React app via an explicit import in `src/App.jsx`.
- Removed the old local `DeveloperPage` placeholder that rendered itself recursively.
- Kept the existing authenticated sidebar item **عن المطور** wired to the portfolio page.
- Added a link on the sign-in/register screen so visitors can open the portfolio without logging in.
- Added a return-to-Emtehani button on the portfolio. It returns to the dashboard when signed in, or to the auth screen when signed out.
- Portfolio CSS remains scoped under `.portfolio-page`, so it does not intentionally restyle the exam app.

## Run locally
1. Open this folder in a terminal.
2. Run `npm install` to install dependencies for your operating system.
3. Set `VITE_API_URL` in `.env` if your backend is not at `http://localhost:5000`.
4. Run `npm run dev`.
5. Verify both paths: open the portfolio link on the auth screen, then sign in and use **عن المطور** in the sidebar.

## Build verification
A build was attempted in the packaging environment, but the bundled `node_modules` contained platform-specific/missing Rolldown native bindings. Reinstalling dependencies with `npm install` on the target OS is required before a meaningful Vite build check.

## Notes
- The project inquiry form opens WhatsApp with a prefilled message; it does not persist submissions to a server.
- Live project URLs were not invented. Add them to the portfolio when available.
