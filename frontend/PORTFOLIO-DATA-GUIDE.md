# Portfolio customization

All developer profile information and portfolio content is centralized in:

`src/developerData.js`

Edit this file to change:
- Developer name, initials, role, contact links, email, phone, and WhatsApp number
- Portfolio images and technology stack
- Projects, descriptions, categories, and technology tags
- Services and workflow steps
- Arabic and English portfolio copy

`src/DeveloperPage.jsx` contains the page behavior and layout. `src/DeveloperPage.css` contains styling, responsive rules, and animations. Keep the data in `developerData.js` and the presentation in the component/CSS.

The page respects `prefers-reduced-motion` for users who have reduced animation enabled.
